#!/usr/bin/env python3
"""V5: Proper conversation extractor with accurate message boundary detection."""

import re

def extract_conversation(filepath):
    """Extract conversation from accessibility tree snapshot."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')
    
    # Strategy: Identify user message containers by the pattern:
    # - generic (user msg container)
    #   - generic
    #     - StaticText "user message"
    #     - generic "Copy" or button "Show full message"
    # - generic (GLM response container)
    #   - image "profile"
    #   - generic "GLM-4.7"
    
    # Find GLM-4.7 label positions
    glm_positions = []
    for i, line in enumerate(lines):
        if 'generic "GLM-4.7"' in line:
            glm_positions.append(i)
    
    print(f"GLM positions: {glm_positions}")
    
    # For each GLM position, find the user message that precedes it
    # The user message is the StaticText that appears in the 2-5 lines before the GLM container
    # Pattern: StaticText → Copy button → generic → image "profile" → generic "GLM-4.7"
    
    user_messages = []
    for glm_pos in glm_positions:
        # Look backwards for the user message
        user_msg = None
        for i in range(glm_pos - 1, max(0, glm_pos - 20), -1):
            line = lines[i].strip()
            static_match = re.search(r'StaticText "(.*)"', line)
            if static_match:
                text = static_match.group(1).replace('\\"', '"')
                # Skip UI artifacts
                if text not in ['Loading...', 'Agent Loop with Tools and Prompts', 'Copy',
                               'GLM-4.7', 'Thought Process', 'profile', '3/3']:
                    # Check if this is followed by a Copy or Show full message button
                    found_copy = False
                    for j in range(i+1, min(i+5, glm_pos+1)):
                        if 'generic "Copy"' in lines[j] or 'button "Show full message"' in lines[j]:
                            found_copy = True
                            break
                    if found_copy:
                        text = text.replace('\\n', '\n')
                        user_msg = (i, text)
                        break
        
        user_messages.append(user_msg)
    
    # Build conversation
    conversation = []
    
    for idx, glm_pos in enumerate(glm_positions):
        # Add user message
        if user_messages[idx]:
            conversation.append(('user', user_messages[idx][1]))
        
        # Determine GLM response boundaries
        glm_start = glm_pos
        if idx + 1 < len(glm_positions):
            glm_end = glm_positions[idx + 1]
        else:
            glm_end = len(lines)
        
        # But we need to stop before the next user message
        # The next user message appears right before the next GLM position
        # So glm_end is correct
        
        # Extract GLM response
        glm_parts = extract_glm_response(lines, glm_start, glm_end)
        conversation.append(('glm', glm_parts))
    
    return conversation


def extract_glm_response(lines, start, end):
    """Extract GLM response content."""
    parts = []
    i = start
    
    # Skip past GLM-4.7 label and Thought Process button
    thought_end = False
    while i < end and not thought_end:
        stripped = lines[i].strip()
        if 'button "Thought Process"' in stripped:
            # Skip the entire Thought Process section
            i += 1
            # Skip until we hit actual content (paragraph, heading, separator)
            while i < end:
                s = lines[i].strip()
                if s == '- paragraph' or s.startswith('- heading') or s == '- separator' or \
                   s.startswith('textbox') or s == '- list':
                    thought_end = True
                    break
                i += 1
            break
        i += 1
    
    if not thought_end and i >= end:
        return parts
    
    # State tracking
    in_code_duplicate = False
    current_code_lang = ''
    duplicate_depth = 0  # Track depth of duplicate code section
    
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
            'StaticText "Loading..."', 'StaticText "Agent Loop with Tools and Prompts"',
        ]):
            i += 1
            continue
        
        # Skip user message containers (they appear at the end of the GLM section)
        # User messages are identified by the Copy button pattern
        if 'generic "Copy"' in stripped:
            # Check if this Copy is followed by a GLM label (meaning it's a user msg container)
            for j in range(i+1, min(i+5, end)):
                if 'GLM-4.7' in lines[j]:
                    # This is a user message area, stop extracting GLM content
                    # Actually no, the GLM response might continue after a Copy button
                    # Let me just skip this Copy button
                    break
            i += 1
            continue
        
        # Detect textbox (code block start)
        textbox_match = re.match(r'(\s*)- textbox \[\w+\]: (.*)', line)
        if textbox_match:
            first_line = textbox_match.group(2)
            
            # Read the full code block
            code_lines = [first_line]
            j = i + 1
            while j < end:
                next_line = lines[j]
                next_stripped = next_line.strip()
                
                # Code lines don't start with "- "
                if next_stripped and not next_stripped.startswith('- '):
                    code_lines.append(next_stripped)
                    j += 1
                elif not next_stripped:
                    j += 1
                else:
                    break
            
            parts.append(('code', current_code_lang, '\n'.join(code_lines)))
            in_code_duplicate = True
            i = j
            continue
        
        # Handle structural elements that end code duplicate mode
        if in_code_duplicate:
            if stripped.startswith('- heading') or stripped == '- separator' or \
               stripped == '- paragraph' or stripped.startswith('- paragraph'):
                in_code_duplicate = False
            elif stripped.startswith('- StaticText') or stripped.startswith('- generic') or \
                 stripped.startswith('- LineBreak') or stripped == '- generic' or \
                 'listitem' in stripped:
                # Skip duplicate code content
                i += 1
                continue
            elif stripped.startswith('- strong') or stripped.startswith('- emphasis') or \
                 stripped.startswith('- code ') or stripped.startswith('- list') or \
                 stripped.startswith('- ListMarker'):
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
            if text in ['Copy', 'Thought Process', 'Show full message', 'GLM-4.7', 'profile',
                        '3/3', '2/2', '1/3']:
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
    table_rows = []
    current_row = []
    
    def flush_table():
        nonlocal in_table, table_headers, table_rows, current_row
        if in_table and (table_headers or current_row):
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
            current_row.append(part[1])
            # Simple heuristic: if we have as many cells as headers, start a new row
            if table_headers and len(current_row) >= len(table_headers):
                table_rows.append(current_row)
                current_row = []
    
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


# Run
if __name__ == '__main__':
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    conversation = extract_conversation(filepath)
    
    print(f"\nExtracted {len(conversation)} messages:")
    for i, (role, content) in enumerate(conversation):
        if isinstance(content, str):
            preview = content[:120].replace('\n', '\\n')
        else:
            preview = parts_to_markdown(content)[:120].replace('\n', '\\n')
        print(f"  [{i}] {role}: {preview}...")
    
    md = build_markdown(conversation)
    
    with open('/home/z/my-project/download/chat_devmind_extracted.md', 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"\nWrote {len(md)} chars to output file")
