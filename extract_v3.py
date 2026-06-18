#!/usr/bin/env python3
"""V3: Comprehensive chat extractor with proper code block handling."""

import re
import json

def extract_conversation(filepath):
    """Extract the full conversation from accessibility tree."""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Step 1: Identify message boundaries using GLM-4.7 labels
    # GLM-4.7 labels appear as: - generic "GLM-4.7" or - StaticText "GLM-4.7"
    glm_positions = []
    for i, line in enumerate(lines):
        if 'generic "GLM-4.7"' in line:
            glm_positions.append(i)
    
    print(f"Found {len(glm_positions)} GLM-4.7 labels at positions: {glm_positions}")
    
    # Step 2: Extract user messages (they appear before GLM-4.7 labels)
    # User messages are the StaticText elements that appear in the user message container
    # which is right before the GLM-4.7 container
    
    # Step 3: For each message, extract content
    # We'll process the file in segments based on the GLM-4.7 positions
    
    messages = []
    
    # First user message (before first GLM label)
    # Look for StaticText in the user message area (lines before first GLM label)
    first_user_end = glm_positions[0] if glm_positions else len(lines)
    
    # Find the user message container
    for i in range(0, first_user_end):
        line = lines[i].strip()
        static_match = re.search(r'StaticText "(.*?)"', line)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            if text not in ['Loading...', 'Agent Loop with Tools and Prompts', 'Copy']:
                messages.append(('user', text))
    
    # Now process each GLM response and the user message that follows
    for idx, glm_pos in enumerate(glm_positions):
        # Find the end of this GLM response (next GLM label or end of file)
        if idx + 1 < len(glm_positions):
            next_glm = glm_positions[idx + 1]
        else:
            next_glm = len(lines)
        
        # Extract GLM response content
        glm_content = extract_glm_response(lines, glm_pos, next_glm)
        messages.append(('glm', glm_content))
        
        # Extract user message between this GLM response and the next one
        # User messages appear near the end of the current section, just before next GLM
        if idx + 1 < len(glm_positions):
            user_msg = extract_user_message(lines, glm_pos, next_glm)
            if user_msg:
                messages.append(('user', user_msg))
    
    # Check for last user message after the last GLM response
    last_user = extract_user_message(lines, glm_positions[-1], len(lines))
    if last_user:
        messages.append(('user', last_user))
    
    return messages


def extract_user_message(lines, start, end):
    """Extract user message from a section of the file."""
    # User messages appear as StaticText with \n for multi-line content
    # They typically appear right before the next GLM-4.7 label
    # Look for "Copy" button followed by GLM label
    
    for i in range(start, end):
        line = lines[i].strip()
        static_match = re.search(r'StaticText "(.*?)"', line)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            # User messages typically start with specific patterns
            if text and text not in ['Loading...', 'Agent Loop with Tools and Prompts', 
                                     'Copy', 'GLM-4.7', 'Thought Process', 'Show full message', 'profile']:
                # Check if this looks like a user message (before a Copy button or GLM label)
                # Look ahead for Copy or GLM-4.7
                for j in range(i+1, min(i+5, end)):
                    if 'generic "Copy"' in lines[j] or 'GLM-4.7' in lines[j]:
                        return text
    
    return None


def extract_glm_response(lines, start, end):
    """Extract GLM response content from the accessibility tree."""
    parts = []
    i = start
    
    # Skip the GLM-4.7 label and Thought Process button
    while i < end:
        if 'Thought Process' in lines[i] and 'button' in lines[i]:
            i += 1
            break
        i += 1
    
    in_code_block = False
    code_buffer = []
    code_lang = ''
    skip_duplicate_code = False
    
    while i < end:
        line = lines[i]
        stripped = line.strip()
        
        # Detect code block start (textbox element)
        textbox_match = re.match(r'\s*- textbox \[\w+\]: (.*)', line)
        if textbox_match:
            # Save any previous code block
            if in_code_block and code_buffer:
                parts.append(('code', code_lang, '\n'.join(code_buffer)))
                code_buffer = []
            
            first_line = textbox_match.group(1)
            in_code_block = True
            skip_duplicate_code = True
            code_buffer = [first_line]
            code_lang = ''  # Will be set from the StaticText before this
            
            # Continue reading code lines
            j = i + 1
            while j < end:
                next_line = lines[j]
                next_stripped = next_line.strip()
                
                # Check if this is a structural element that ends the code
                if next_stripped.startswith('- ') and not next_line.startswith('                  '):
                    break
                if next_stripped.startswith('- StaticText') or next_stripped.startswith('- generic') or \
                   next_stripped.startswith('- LineBreak') or next_stripped.startswith('- separator') or \
                   next_stripped.startswith('- heading') or next_stripped.startswith('- paragraph') or \
                   next_stripped.startswith('- button') or next_stripped.startswith('- list') or \
                   next_stripped.startswith('- emphasis') or next_stripped.startswith('- strong') or \
                   next_stripped.startswith('- code ') or next_stripped.startswith('- image') or \
                   next_stripped.startswith('- row') or next_stripped.startswith('- columnheader') or \
                   next_stripped.startswith('- cell') or next_stripped.startswith('- table'):
                    break
                
                # It's a code line
                if next_stripped:
                    code_buffer.append(next_stripped)
                else:
                    code_buffer.append('')
                
                j += 1
            
            i = j
            continue
        
        # If we're skipping duplicate code (StaticText after textbox), skip until next structural element
        if skip_duplicate_code and stripped.startswith('- StaticText'):
            # This is likely a duplicate of the code block content
            # Skip until we hit a non-code structural element
            i += 1
            continue
        
        if skip_duplicate_code and (stripped.startswith('- generic') or stripped == '- LineBreak "\\n"'):
            i += 1
            continue
        
        # Reset skip flag on structural elements
        if stripped.startswith('- separator') or stripped.startswith('- heading') or \
           stripped.startswith('- paragraph') or stripped.startswith('- list') or \
           stripped == '- generic' or 'generic "Copy"' in stripped or \
           'button "Show' in stripped or 'image "profile"' in stripped or \
           'generic "GLM-4.7"' in stripped or 'button "Thought Process"' in stripped:
            if stripped.startswith('- separator') or stripped.startswith('- heading') or stripped.startswith('- paragraph'):
                skip_duplicate_code = False
                # Save any pending code block
                if in_code_block and code_buffer:
                    parts.append(('code', code_lang, '\n'.join(code_buffer)))
                    code_buffer = []
                    in_code_block = False
            i += 1
            continue
        
        # Extract headings
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            parts.append(('heading', level, text))
            skip_duplicate_code = False
            i += 1
            continue
        
        # Extract table headers and cells
        colheader_match = re.search(r'columnheader "(.*?)"', stripped)
        if colheader_match:
            text = colheader_match.group(1).replace('\\"', '"')
            parts.append(('table_cell', text, True))
            i += 1
            continue
        
        cell_match = re.search(r'cell "(.*?)"', stripped)
        if cell_match:
            text = cell_match.group(1).replace('\\"', '"')
            parts.append(('table_cell', text, False))
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
            if text in ['Copy', 'Thought Process', 'Show full message', 'GLM-4.7', 'profile', 'typescript', 'bash', 'json', 'python', 'text', 'tsx']:
                # But 'typescript' etc. might be code language labels
                if text in ['typescript', 'bash', 'json', 'python', 'text', 'tsx']:
                    code_lang = text
                i += 1
                continue
            
            parts.append(('text', text))
            i += 1
            continue
        
        # Handle separator
        if stripped == '- separator':
            parts.append(('separator',))
            skip_duplicate_code = False
            i += 1
            continue
        
        # Skip other structural elements
        i += 1
    
    # Save any remaining code block
    if in_code_block and code_buffer:
        parts.append(('code', code_lang, '\n'.join(code_buffer)))
    
    return parts


def parts_to_markdown(parts):
    """Convert parts to markdown text."""
    result = []
    i = 0
    
    while i < len(parts):
        part = parts[i]
        
        if part[0] == 'text':
            result.append(part[1])
        elif part[0] == 'heading':
            level = part[1]
            text = part[2]
            result.append(f"\n\n{'#' * level} {text}\n\n")
        elif part[0] == 'code':
            lang = part[1]
            code = part[2]
            result.append(f"\n```{lang}\n{code}\n```\n")
        elif part[0] == 'marker':
            marker = part[1]
            result.append(f"\n{marker} ")
        elif part[0] == 'separator':
            result.append('\n\n---\n\n')
        elif part[0] == 'table_cell':
            # Handle table cells
            text = part[1]
            is_header = part[2]
            result.append(f" | {text}")
        
        i += 1
    
    return ''.join(result)


def build_markdown(messages):
    """Build the final markdown document."""
    md = ['# DevMind Agent - Chat con GLM-4.7', '', '---', '']
    
    for i, (role, content) in enumerate(messages):
        if role == 'user':
            md.append('## 👤 Usuario')
            md.append('')
            # User messages are plain text
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
    messages = extract_conversation(filepath)
    
    print(f"\nExtracted {len(messages)} messages:")
    for i, (role, content) in enumerate(messages):
        if isinstance(content, str):
            preview = content[:100].replace('\n', ' ')
        else:
            preview = parts_to_markdown(content)[:100].replace('\n', ' ')
        print(f"  [{i}] {role}: {preview}...")
    
    md = build_markdown(messages)
    
    with open('/home/z/my-project/download/chat_devmind_extracted.md', 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"\nWrote {len(md)} chars to output file")
