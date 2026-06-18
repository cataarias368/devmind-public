#!/usr/bin/env python3
"""V4: Clean conversation extractor with proper message boundary detection."""

import re

def extract_conversation(filepath):
    """Extract conversation from accessibility tree snapshot."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    
    # Find GLM-4.7 label positions (generic "GLM-4.7" marks start of GLM response)
    glm_starts = []
    for i, line in enumerate(lines):
        if 'generic "GLM-4.7"' in line:
            glm_starts.append(i)
    
    print(f"GLM-4.7 labels at lines: {[g+1 for g in glm_starts]}")
    
    # Conversation structure:
    # [user_msg_1] [glm_response_1] [user_msg_2] [glm_response_2] ... [user_msg_5] [glm_response_5]
    
    # For user messages, they appear as StaticText right before the GLM-4.7 label
    # For GLM responses, they contain all the content after the label
    
    # Define message boundaries
    # Each exchange: user message → GLM response
    # User message boundaries: between end of previous GLM response and start of next GLM label
    
    conversation = []
    
    for idx, glm_start in enumerate(glm_starts):
        # Find the user message - it's the StaticText that appears right before the GLM label
        # Look backwards from glm_start for a StaticText that's not a UI artifact
        user_msg = find_user_message(lines, 0 if idx == 0 else glm_starts[idx-1], glm_start)
        
        if user_msg:
            conversation.append(('user', user_msg))
        
        # Find the GLM response end (next GLM label or end of file)
        if idx + 1 < len(glm_starts):
            glm_end = glm_starts[idx + 1]
        else:
            glm_end = len(lines)
        
        # Extract GLM response
        glm_content = extract_glm_content(lines, glm_start, glm_end)
        conversation.append(('glm', glm_content))
    
    # Check for user message after last GLM response
    last_user = find_user_message(lines, glm_starts[-1], len(lines))
    if last_user:
        conversation.append(('user', last_user))
    
    return conversation


def find_user_message(lines, search_start, search_end):
    """Find user message in a section of the file."""
    # User messages are StaticText elements that:
    # 1. Are not UI artifacts
    # 2. Appear in the user message container (before "Copy" button, before GLM-4.7 label)
    
    # Strategy: Find the StaticText that's closest to the GLM-4.7 label
    # and is followed by a "Copy" or "Show full message" button
    
    best_msg = None
    best_pos = -1
    
    for i in range(search_start, search_end):
        line = lines[i].strip()
        static_match = re.search(r'StaticText "(.*?)"', line)
        if not static_match:
            continue
        
        text = static_match.group(1).replace('\\"', '"')
        
        # Skip UI artifacts
        if text in ['Loading...', 'Agent Loop with Tools and Prompts', 'Copy', 
                     'GLM-4.7', 'Thought Process', 'Show full message', 'profile',
                     'typescript', 'bash', 'json', 'python', 'text', 'tsx']:
            continue
        
        # Check if this StaticText is followed by "Copy" or "Show full message" button
        # (which marks it as a user message)
        for j in range(i+1, min(i+5, search_end)):
            if 'generic "Copy"' in lines[j] or 'button "Show full message"' in lines[j]:
                # This is a user message
                # Handle \n escapes in the text
                text = text.replace('\\n', '\n')
                if len(text) > len(str(best_msg or '')):
                    best_msg = text
                    best_pos = i
                break
    
    return best_msg


def extract_glm_content(lines, start, end):
    """Extract GLM response content as structured parts."""
    parts = []
    i = start
    
    # Skip past GLM-4.7 label and Thought Process button
    while i < end:
        line = lines[i].strip()
        if 'button "Thought Process"' in line:
            i += 1
            # Skip the Thought Process button content (images, etc.)
            while i < end and 'paragraph' not in lines[i] and 'heading' not in lines[i] and 'separator' not in lines[i]:
                i += 1
            break
        i += 1
    
    # State tracking
    in_code_duplicate = False  # Skip duplicate code from StaticText after textbox
    code_end_indent = 0  # Indentation level of code block
    current_code_lang = ''
    
    # Process the GLM response content
    while i < end:
        line = lines[i]
        stripped = line.strip()
        indent = len(line) - len(line.lstrip())
        
        # Skip empty lines
        if not stripped:
            i += 1
            continue
        
        # Skip UI elements
        if any(skip in stripped for skip in [
            'button "Thought Process"', 'generic "Copy"', 'button "Copy"',
            'button "Show full message"', 'image "profile"',
            'generic "GLM-4.7"', 'StaticText "GLM-4.7"',
            'StaticText "Thought Process"', 'StaticText "Copy"',
            'StaticText "Show full message"', 'StaticText "profile"',
        ]):
            i += 1
            continue
        
        # Skip "Loading..." and title
        if stripped in ['StaticText "Loading..."', 'StaticText "Agent Loop with Tools and Prompts"']:
            i += 1
            continue
        
        # Detect code block start (textbox)
        textbox_match = re.match(r'(\s*)- textbox \[\w+\]: (.*)', line)
        if textbox_match:
            code_indent = len(textbox_match.group(1))
            first_line = textbox_match.group(2)
            
            # Read the full code block
            code_lines = [first_line]
            j = i + 1
            while j < end:
                next_line = lines[j]
                next_stripped = next_line.strip()
                next_indent = len(next_line) - len(next_line.lstrip())
                
                # Code continuation: same or deeper indent, not a structural element
                if next_stripped and not next_stripped.startswith('- '):
                    code_lines.append(next_stripped)
                    j += 1
                elif not next_stripped:
                    j += 1  # Skip empty lines within code
                else:
                    break
            
            parts.append(('code', current_code_lang, '\n'.join(code_lines)))
            
            # Now skip the duplicate StaticText code lines
            in_code_duplicate = True
            i = j
            continue
        
        # Handle structural elements that end code duplicate mode
        if stripped.startswith('- separator') or stripped.startswith('- heading') or \
           stripped == '- paragraph' or stripped.startswith('- paragraph'):
            in_code_duplicate = False
        
        # Skip duplicate code (StaticText after textbox)
        if in_code_duplicate:
            if stripped.startswith('- StaticText') or stripped.startswith('- generic') or \
               stripped.startswith('- LineBreak') or stripped == '- generic' or \
               'listitem' in stripped:
                i += 1
                continue
            else:
                in_code_duplicate = False
        
        # Extract heading
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            parts.append(('heading', level, text))
            i += 1
            continue
        
        # Extract table content
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
        
        # Extract list markers
        marker_match = re.search(r'ListMarker "(.*?)"', stripped)
        if marker_match:
            marker = marker_match.group(1)
            parts.append(('marker', marker))
            i += 1
            continue
        
        # Extract StaticText
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            
            # Skip UI artifacts
            if text in ['Copy', 'Thought Process', 'Show full message', 'GLM-4.7', 'profile']:
                i += 1
                continue
            
            # Detect code language labels
            if text in ['typescript', 'bash', 'json', 'python', 'text', 'tsx']:
                current_code_lang = text
                i += 1
                continue
            
            parts.append(('text', text))
            i += 1
            continue
        
        # Handle separator
        if stripped == '- separator':
            parts.append(('separator',))
            i += 1
            continue
        
        # Skip other structural elements
        i += 1
    
    return parts


def parts_to_markdown(parts):
    """Convert structured parts to markdown."""
    result = []
    in_table = False
    table_headers = []
    table_row = []
    
    def flush_table():
        nonlocal in_table, table_headers, table_row
        if not in_table:
            return
        if table_row:
            if table_headers:
                result.append('| ' + ' | '.join(table_headers) + ' |\n')
                result.append('| ' + ' | '.join(['---'] * len(table_headers)) + ' |\n')
            result.append('| ' + ' | '.join(table_row) + ' |\n')
        table_row = []
        table_headers = []
        in_table = False
    
    for part in parts:
        if part[0] == 'text':
            flush_table()
            result.append(part[1])
        elif part[0] == 'heading':
            flush_table()
            level = part[1]
            text = part[2]
            result.append(f"\n\n{'#' * level} {text}\n\n")
        elif part[0] == 'code':
            flush_table()
            lang = part[1]
            code = part[2]
            result.append(f"\n```{lang}\n{code}\n```\n")
        elif part[0] == 'marker':
            flush_table()
            marker = part[1]
            result.append(f"\n{marker} ")
        elif part[0] == 'separator':
            flush_table()
            result.append('\n\n---\n\n')
        elif part[0] == 'table_header':
            in_table = True
            table_headers.append(part[1])
        elif part[0] == 'table_cell':
            in_table = True
            table_row.append(part[1])
    
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
                # User messages may contain markdown (code blocks, etc.)
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


# Run
if __name__ == '__main__':
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    conversation = extract_conversation(filepath)
    
    print(f"\nExtracted {len(conversation)} messages:")
    for i, (role, content) in enumerate(messages if False else conversation):
        if isinstance(content, str):
            preview = content[:150].replace('\n', '\\n')
        else:
            preview = parts_to_markdown(content)[:150].replace('\n', '\\n')
        print(f"  [{i}] {role}: {preview}...")
    
    md = build_markdown(conversation)
    
    with open('/home/z/my-project/download/chat_devmind_extracted.md', 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"\nWrote {len(md)} chars to output file")
