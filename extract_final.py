#!/usr/bin/env python3
"""Final comprehensive chat extractor with proper handling of all content types."""

import re
import json

def main():
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    
    # ===== STEP 1: Identify conversation structure =====
    # GLM-4.7 labels mark the start of GLM responses
    glm_starts = []
    for i, line in enumerate(lines):
        if 'generic "GLM-4.7"' in line:
            glm_starts.append(i)
    
    # User messages are the StaticText elements just before each GLM label
    # They appear in the pattern: StaticText "msg" → Copy button → generic → image "profile" → GLM-4.7
    
    # ===== STEP 2: Extract user messages =====
    user_msgs = {}  # Map: glm_start_index → user_message_text
    
    for glm_idx in glm_starts:
        # Search backwards from GLM label for user message
        for i in range(glm_idx - 1, max(0, glm_idx - 15), -1):
            line = lines[i].strip()
            static_match = re.search(r'StaticText "(.*)"', line)
            if not static_match:
                continue
            text = static_match.group(1).replace('\\"', '"')
            if text in ['Loading...', 'Agent Loop with Tools and Prompts', 'Copy',
                       'GLM-4.7', 'Thought Process', 'profile', '3/3', '2/2', '1/1']:
                continue
            # Verify it's a user message by checking for Copy button after it
            found_copy = False
            for j in range(i+1, min(i+4, glm_idx+1)):
                if 'generic "Copy"' in lines[j] or 'button "Show full message"' in lines[j]:
                    found_copy = True
                    break
            if found_copy:
                text = text.replace('\\n', '\n')
                user_msgs[glm_idx] = text
                break
    
    print(f"Found {len(user_msgs)} user messages")
    for k, v in user_msgs.items():
        print(f"  Before line {k+1}: {v[:80].replace(chr(10), ' ')}...")
    
    # ===== STEP 3: Extract GLM responses =====
    # Each GLM response goes from its label to the next user message area
    
    conversation = []
    
    for idx, glm_start in enumerate(glm_starts):
        # Add user message
        if glm_start in user_msgs:
            conversation.append(('user', user_msgs[glm_start]))
        
        # Determine GLM response end
        # The response ends where the next user message begins (just before the Copy button)
        if idx + 1 < len(glm_starts):
            next_glm = glm_starts[idx + 1]
        else:
            next_glm = len(lines)
        
        # Extract GLM response content
        glm_parts = extract_glm_response(lines, glm_start, next_glm)
        conversation.append(('glm', glm_parts))
    
    # Check for user message after last GLM response
    # (unlikely based on the data, but check anyway)
    
    # ===== STEP 4: Build markdown =====
    md = build_markdown(conversation)
    
    output_path = '/home/z/my-project/download/chat_devmind_extracted.md'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"\nWrote {len(md)} chars to {output_path}")
    print(f"Total messages: {len(conversation)}")


def extract_glm_response(lines, start, end):
    """Extract GLM response content as structured parts."""
    parts = []
    i = start
    
    # Skip past GLM-4.7 label and Thought Process button
    while i < end:
        stripped = lines[i].strip()
        if stripped == '- paragraph' or stripped.startswith('- heading') or stripped == '- separator':
            break
        if 'button "Thought Process"' in stripped:
            i += 1
            # Skip Thought Process section until we hit actual content
            while i < end:
                s = lines[i].strip()
                if s == '- paragraph' or s.startswith('- heading') or s == '- separator':
                    break
                i += 1
            break
        i += 1
    
    # Track state for code block duplicate skipping
    in_duplicate = False
    code_lang = ''
    
    while i < end:
        line = lines[i]
        stripped = line.strip()
        indent = len(line) - len(line.lstrip())
        
        if not stripped:
            i += 1
            continue
        
        # ===== Skip UI elements =====
        if should_skip(stripped):
            i += 1
            continue
        
        # ===== Handle code blocks (textbox) =====
        textbox_match = re.match(r'\s*- textbox \[\w+\]: (.*)', line)
        if textbox_match:
            first_line = textbox_match.group(2) if textbox_match.lastindex >= 2 else textbox_match.group(1)
            first_line = textbox_match.group(1)
            
            # Read full code block
            code_lines = [first_line]
            j = i + 1
            while j < end:
                next_line = lines[j]
                next_stripped = next_line.strip()
                # Code continuation lines don't start with "- "
                if next_stripped and not next_stripped.startswith('- '):
                    code_lines.append(next_stripped)
                    j += 1
                elif not next_stripped:
                    j += 1
                else:
                    break
            
            parts.append(('code', code_lang, '\n'.join(code_lines)))
            in_duplicate = True
            i = j
            continue
        
        # ===== Skip duplicate code content =====
        if in_duplicate:
            # Duplicate code is in StaticText/generic/LineBreak elements after textbox
            if stripped.startswith('- StaticText') or stripped.startswith('- generic') or \
               stripped.startswith('- LineBreak') or stripped == '- generic' or \
               stripped.startswith('- listitem') or stripped.startswith('- ListMarker') or \
               stripped.startswith('- strong') or stripped.startswith('- emphasis') or \
               stripped.startswith('- code ') or stripped.startswith('- list'):
                i += 1
                continue
            
            # End duplicate mode on structural boundaries
            if stripped.startswith('- heading') or stripped == '- separator' or \
               stripped == '- paragraph' or stripped.startswith('- paragraph') or \
               stripped.startswith('- table') or stripped.startswith('- row') or \
               stripped.startswith('- columnheader') or stripped.startswith('- cell'):
                in_duplicate = False
                # Don't increment i, process this line normally
                continue
            
            # Also end on button or image elements
            if stripped.startswith('- button') or stripped.startswith('- image') or \
               'generic "Copy"' in stripped or 'button "Show' in stripped:
                in_duplicate = False
                i += 1
                continue
            
            # Default: end duplicate mode
            in_duplicate = False
        
        # ===== Extract headings =====
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            parts.append(('heading', level, text))
            i += 1
            continue
        
        # ===== Extract table content =====
        colheader_match = re.search(r'columnheader "(.*?)"', stripped)
        if colheader_match:
            text = colheader_match.group(1).replace('\\"', '"')
            parts.append(('table_header', text))
            i += 1
            continue
        
        cell_match = re.search(r'cell "(.*?)"', stripped)
        if cell_match:
            text = cell_match.group(1).replace('\\"', '"')
            parts.append(('table_cell', text))
            i += 1
            continue
        
        # ===== Extract list markers =====
        marker_match = re.search(r'ListMarker "(.*?)"', stripped)
        if marker_match:
            marker = marker_match.group(1)
            parts.append(('marker', marker))
            i += 1
            continue
        
        # ===== Extract StaticText =====
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            
            # Skip UI artifacts
            if text in ['Copy', 'Thought Process', 'Show full message', 'GLM-4.7', 'profile',
                        '3/3', '2/2', '1/1', '1/3', '2/3']:
                i += 1
                continue
            
            # Detect code language labels
            if text in ['typescript', 'bash', 'json', 'python', 'text', 'tsx']:
                code_lang = text
                i += 1
                continue
            
            # Check if this StaticText is inside a strong element
            # Look at the surrounding context
            is_bold = False
            is_italic = False
            is_inline_code = False
            
            # Check preceding lines for strong/emphasis/code context
            for j in range(max(0, i-2), i):
                prev = lines[j].strip()
                if prev == '- strong':
                    is_bold = True
                if prev == '- emphasis':
                    is_italic = True
                if '- code ' in prev and 'textbox' not in prev:
                    is_inline_code = True
            
            # Format text with markers
            if is_inline_code:
                text = f'`{text}`'
            elif is_bold and is_italic:
                text = f'***{text}***'
            elif is_bold:
                text = f'**{text}**'
            elif is_italic:
                text = f'*{text}*'
            
            parts.append(('text', text))
            i += 1
            continue
        
        # ===== Handle separator =====
        if stripped == '- separator':
            parts.append(('separator',))
            i += 1
            continue
        
        # ===== Handle paragraph boundary =====
        if stripped == '- paragraph':
            parts.append(('paragraph_break',))
            i += 1
            continue
        
        # ===== Skip other structural elements =====
        i += 1
    
    return parts


def should_skip(stripped):
    """Check if this line should be skipped entirely."""
    skip_patterns = [
        'button "Thought Process"', 'button "Copy"', 'generic "Copy"',
        'button "Show full message"', 'image "profile"',
        'generic "GLM-4.7"', 'StaticText "GLM-4.7"',
        'StaticText "Thought Process"', 'StaticText "Copy"',
        'StaticText "Show full message"', 'StaticText "profile"',
        'StaticText "Loading..."', 'StaticText "Agent Loop with Tools and Prompts"',
        'button [ref=e16]', 'button [ref=e17]',  # Pagination buttons
    ]
    return any(p in stripped for p in skip_patterns)


def parts_to_markdown(parts):
    """Convert structured parts to clean markdown."""
    result = []
    in_table = False
    table_headers = []
    table_rows = []
    current_row = []
    
    def flush_table():
        nonlocal in_table, table_headers, table_rows, current_row
        if in_table and (table_headers or current_row):
            if current_row:
                table_rows.append(current_row[:])
                current_row = []
            if table_headers:
                header_line = '| ' + ' | '.join(table_headers) + ' |'
                sep_line = '| ' + ' | '.join(['---'] * len(table_headers)) + ' |'
                result.append(header_line + '\n')
                result.append(sep_line + '\n')
            for row in table_rows:
                result.append('| ' + ' | '.join(row) + ' |\n')
            result.append('\n')
        table_headers = []
        table_rows = []
        current_row = []
        in_table = False
    
    prev_type = None
    
    for part in parts:
        ptype = part[0]
        
        if ptype == 'text':
            flush_table()
            # Add space between consecutive text parts if needed
            if prev_type == 'text':
                result.append(' ')
            result.append(part[1])
        
        elif ptype == 'heading':
            flush_table()
            level = part[1]
            text = part[2]
            result.append(f"\n\n{'#' * level} {text}\n\n")
        
        elif ptype == 'code':
            flush_table()
            lang = part[1]
            code = part[2]
            result.append(f"\n```{lang}\n{code}\n```\n")
        
        elif ptype == 'marker':
            flush_table()
            marker = part[1]
            result.append(f"\n{marker} ")
        
        elif ptype == 'separator':
            flush_table()
            result.append('\n\n---\n\n')
        
        elif ptype == 'paragraph_break':
            flush_table()
            result.append('\n\n')
        
        elif ptype == 'table_header':
            in_table = True
            table_headers.append(part[1])
        
        elif ptype == 'table_cell':
            in_table = True
            current_row.append(part[1])
            # When we have enough cells for a complete row
            if table_headers and len(current_row) >= len(table_headers):
                table_rows.append(current_row[:])
                current_row = []
        
        prev_type = ptype
    
    flush_table()
    return ''.join(result)


def build_markdown(conversation):
    """Build the final markdown document."""
    md = ['# DevMind Agent - Chat con GLM-4.7', '', '---', '']
    
    for i, (role, content) in enumerate(conversation):
        if role == 'user':
            md.append('## 👤 Usuario')
            md.append('')
            if isinstance(content, str):
                # User messages may contain markdown formatting
                md.append(content.strip())
            else:
                md.append(parts_to_markdown(content).strip())
        else:
            md.append('## 🤖 GLM-4.7')
            md.append('')
            if isinstance(content, str):
                md.append(content.strip())
            else:
                text = parts_to_markdown(content).strip()
                md.append(text)
        
        md.append('')
        md.append('---')
        md.append('')
    
    return '\n'.join(md)


if __name__ == '__main__':
    main()
