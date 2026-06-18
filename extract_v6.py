#!/usr/bin/env python3
"""V6: Final extractor with proper escaped quote handling and formatting."""

import re

def main():
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    
    # Find GLM-4.7 label positions
    glm_starts = []
    for i, line in enumerate(lines):
        if 'generic "GLM-4.7"' in line:
            glm_starts.append(i)
    
    # Find user messages (StaticText before GLM labels, followed by Copy button)
    user_msgs = {}
    for glm_idx in glm_starts:
        for i in range(glm_idx - 1, max(0, glm_idx - 15), -1):
            line = lines[i].strip()
            # Use proper regex for escaped quotes
            static_match = re.search(r'StaticText "((?:[^"\\]|\\.)*)"', line)
            if not static_match:
                continue
            text = static_match.group(1)
            text = text.replace('\\"', '"').replace('\\n', '\n')
            
            if text in ['Loading...', 'Agent Loop with Tools and Prompts', 'Copy',
                       'GLM-4.7', 'Thought Process', 'profile', '3/3', '2/2', '1/1']:
                continue
            
            found_copy = False
            for j in range(i+1, min(i+4, glm_idx+1)):
                if 'generic "Copy"' in lines[j] or 'button "Show full message"' in lines[j]:
                    found_copy = True
                    break
            if found_copy:
                user_msgs[glm_idx] = text
                break
    
    print(f"Found {len(user_msgs)} user messages")
    
    # Build conversation
    conversation = []
    for idx, glm_start in enumerate(glm_starts):
        if glm_start in user_msgs:
            conversation.append(('user', user_msgs[glm_start]))
        
        glm_end = glm_starts[idx + 1] if idx + 1 < len(glm_starts) else len(lines)
        glm_parts = extract_glm_response(lines, glm_start, glm_end)
        conversation.append(('glm', glm_parts))
    
    # Build markdown
    md = build_markdown(conversation)
    
    output_path = '/home/z/my-project/download/chat_devmind_extracted.md'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"Wrote {len(md)} chars to {output_path}")
    print(f"Total messages: {len(conversation)}")


def extract_static_text(line):
    """Extract StaticText content with proper escaped quote handling."""
    match = re.search(r'StaticText "((?:[^"\\]|\\.)*)"', line)
    if match:
        text = match.group(1)
        text = text.replace('\\"', '"').replace('\\n', '\n')
        return text
    return None


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
            while i < end:
                s = lines[i].strip()
                if s == '- paragraph' or s.startswith('- heading') or s == '- separator':
                    break
                i += 1
            break
        i += 1
    
    # State tracking
    in_duplicate = False
    code_lang = ''
    
    # Track formatting context using indent-based state
    # We'll track whether we're inside strong/emphasis/code by tracking open/close
    format_stack = []  # Stack of 'strong', 'emphasis', 'code'
    last_format_indent = {}
    
    while i < end:
        line = lines[i]
        stripped = line.strip()
        indent = len(line) - len(line.lstrip())
        
        if not stripped:
            i += 1
            continue
        
        # Skip UI elements
        if should_skip(stripped):
            i += 1
            continue
        
        # ===== Handle code blocks (textbox) =====
        textbox_match = re.match(r'\s*- textbox \[\w+\]: (.*)', line)
        if textbox_match:
            first_line = textbox_match.group(1)
            code_lines = [first_line]
            j = i + 1
            while j < end:
                next_line = lines[j]
                next_stripped = next_line.strip()
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
            if stripped.startswith('- StaticText') or stripped.startswith('- generic') or \
               stripped.startswith('- LineBreak') or stripped == '- generic' or \
               stripped.startswith('- listitem') or stripped.startswith('- ListMarker') or \
               stripped.startswith('- strong') or stripped.startswith('- emphasis') or \
               stripped.startswith('- code ') or stripped.startswith('- list') or \
               stripped == '- strong' or stripped == '- emphasis':
                i += 1
                continue
            
            if stripped.startswith('- heading') or stripped == '- separator' or \
               stripped == '- paragraph' or stripped.startswith('- paragraph') or \
               stripped.startswith('- table') or stripped.startswith('- row') or \
               stripped.startswith('- columnheader') or stripped.startswith('- cell'):
                in_duplicate = False
                continue
            
            if stripped.startswith('- button') or stripped.startswith('- image') or \
               'generic "Copy"' in stripped or 'button "Show' in stripped:
                in_duplicate = False
                i += 1
                continue
            
            in_duplicate = False
        
        # ===== Track formatting context =====
        # When we see "- strong", everything inside it is bold until we see a sibling element
        # We use indent level to track nesting
        
        if stripped == '- strong':
            format_stack.append(('strong', indent))
            i += 1
            continue
        
        if stripped == '- emphasis':
            format_stack.append(('emphasis', indent))
            i += 1
            continue
        
        # code elements that aren't textbox
        if re.match(r'\s*- code \[', line):
            format_stack.append(('code', indent))
            i += 1
            continue
        
        # Pop format stack when indent decreases
        while format_stack and indent <= format_stack[-1][1]:
            format_stack.pop()
        
        # ===== Extract headings =====
        heading_match = re.search(r'heading "((?:[^"\\]|\\.)*)"\s*\[level=(\d+)', stripped)
        if heading_match:
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            parts.append(('heading', level, text))
            i += 1
            continue
        
        # ===== Extract table content =====
        colheader_match = re.search(r'columnheader "((?:[^"\\]|\\.)*)"', stripped)
        if colheader_match:
            text = colheader_match.group(1).replace('\\"', '"')
            parts.append(('table_header', text))
            i += 1
            continue
        
        cell_match = re.search(r'cell "((?:[^"\\]|\\.)*)"', stripped)
        if cell_match:
            text = cell_match.group(1).replace('\\"', '"')
            parts.append(('table_cell', text))
            i += 1
            continue
        
        # ===== Extract list markers =====
        marker_match = re.search(r'ListMarker "((?:[^"\\]|\\.)*)"', stripped)
        if marker_match:
            marker = marker_match.group(1).replace('\\"', '"')
            parts.append(('marker', marker))
            i += 1
            continue
        
        # ===== Extract StaticText =====
        text = extract_static_text(stripped)
        if text is not None:
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
            
            # Apply formatting from stack
            fmt_text = text
            active_formats = set(f[0] for f in format_stack)
            if 'code' in active_formats:
                fmt_text = f'`{fmt_text}`'
            else:
                if 'strong' in active_formats and 'emphasis' in active_formats:
                    fmt_text = f'***{fmt_text}***'
                elif 'strong' in active_formats:
                    fmt_text = f'**{fmt_text}**'
                elif 'emphasis' in active_formats:
                    fmt_text = f'*{fmt_text}*'
            
            parts.append(('text', fmt_text))
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
        if current_row:
            table_rows.append(current_row[:])
            current_row = []
        if in_table and (table_headers or table_rows):
            if table_headers:
                result.append('| ' + ' | '.join(table_headers) + ' |\n')
                result.append('| ' + ' | '.join(['---'] * len(table_headers)) + ' |\n')
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
