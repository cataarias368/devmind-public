#!/usr/bin/env python3
"""Comprehensive chat extractor from accessibility tree snapshots."""

import re
import json

def parse_accessibility_tree(filepath):
    """Parse the accessibility tree and extract conversation content."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    # We need to track state: are we in a user message or GLM response?
    # Key markers:
    # - "GLM-4.7" label marks start of GLM response
    # - User messages are the StaticText that appears between GLM blocks
    # - Code blocks start with "textbox" and contain code
    
    conversation = []
    current_role = None
    current_parts = []
    
    # Track code block state
    in_code_block = False
    code_lang = None
    code_lines = []
    code_indent = 0
    
    # Track table state
    in_table = False
    table_rows = []
    current_row = []
    in_header = False
    
    def flush_code():
        nonlocal in_code_block, code_lines, code_lang, code_indent
        if code_lines:
            current_parts.append(('code', code_lang or '', '\n'.join(code_lines)))
        in_code_block = False
        code_lines = []
        code_lang = None
        code_indent = 0
    
    def flush_table():
        nonlocal in_table, table_rows, current_row
        if table_rows:
            current_parts.append(('table', table_rows))
        in_table = False
        table_rows = []
        current_row = []
    
    def save_message():
        nonlocal current_role, current_parts
        flush_code()
        flush_table()
        if current_role and current_parts:
            conversation.append((current_role, current_parts[:]))
        current_parts = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Skip empty lines
        if not stripped:
            i += 1
            continue
        
        # Calculate indentation
        leading_spaces = len(line) - len(line.lstrip(' -'))
        
        # Detect GLM-4.7 label - this marks start of GLM response
        if 'StaticText "GLM-4.7"' in stripped:
            # Save any previous user message
            if current_role == 'user':
                save_message()
            elif current_role == 'glm':
                save_message()
            current_role = 'glm'
            i += 1
            continue
        
        # Skip UI artifacts
        if any(artifact in stripped for artifact in [
            'button "Thought Process"', 'button "Copy"', 'generic "Copy"',
            'button "Show full message"', 'image "profile"',
            'StaticText "Loading..."', 'StaticText "Agent Loop with Tools and Prompts"',
            'StaticText "Thought Process"', 'StaticText "Copy"',
            'StaticText "Show full message"', 'StaticText "profile"',
            'StaticText "GLM-4.7"'
        ]):
            i += 1
            continue
        
        # Skip structural-only elements
        if stripped in ['- generic', '- image', '- separator', '- strong', '- emphasis',
                       '- paragraph', '- list', '- rowgroup', '- row']:
            # For separator, add a separator to content
            if stripped == '- separator':
                flush_code()
                flush_table()
                current_parts.append(('separator',))
            elif stripped == '- paragraph':
                flush_code()
                current_parts.append(('break',))
            i += 1
            continue
        
        # Detect user message - if we haven't set a role yet, this is a user message
        # User messages are StaticText that appear before the GLM-4.7 label
        if current_role is None and 'StaticText' in stripped:
            current_role = 'user'
        
        # Extract headings
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            flush_code()
            flush_table()
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            if current_role:
                current_parts.append(('heading', level, text))
            i += 1
            continue
        
        # Extract table headers and cells
        colheader_match = re.search(r'columnheader "(.*?)"', stripped)
        if colheader_match:
            in_table = True
            in_header = True
            text = colheader_match.group(1).replace('\\"', '"')
            current_row.append(text)
            i += 1
            continue
        
        cell_match = re.search(r'cell "(.*?)"', stripped)
        if cell_match:
            in_table = True
            text = cell_match.group(1).replace('\\"', '"')
            current_row.append(text)
            i += 1
            continue
        
        # When we hit a row boundary in a table
        if '- row' in stripped and in_table:
            if current_row:
                table_rows.append(current_row[:])
                current_row = []
            i += 1
            continue
        
        # Extract list markers
        marker_match = re.search(r'ListMarker "(.*?)"', stripped)
        if marker_match:
            flush_code()
            marker = marker_match.group(1)
            if current_role:
                current_parts.append(('marker', marker))
            i += 1
            continue
        
        # Extract code block start (textbox)
        textbox_match = re.search(r'textbox \[\w+\]:\s*(.*)', stripped)
        if textbox_match:
            flush_code()
            code_content = textbox_match.group(1)
            in_code_block = True
            code_indent = leading_spaces
            code_lines = [code_content]
            i += 1
            continue
        
        # Extract StaticText
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            
            # Skip more UI artifacts
            if text in ['Copy', 'typescript', 'bash', 'json', 'python', 'typescript']:
                # Check if this is a code language label
                if stripped.endswith('"typescript"') or stripped.endswith('"bash"') or stripped.endswith('"json"'):
                    # This might be a code language label before a code block
                    # The next textbox will have the actual code
                    if current_role and not in_code_block:
                        # Don't add language labels as text
                        pass
                    i += 1
                    continue
            
            # If in code block, check if this is code continuation
            if in_code_block:
                # Code continuation lines are at deeper indentation
                if leading_spaces > code_indent:
                    code_lines.append(text)
                    i += 1
                    continue
                else:
                    # Code block ended
                    flush_code()
            
            flush_table()
            
            if current_role:
                current_parts.append(('text', text))
            i += 1
            continue
        
        # Extract LineBreak
        if 'LineBreak' in stripped:
            if in_code_block:
                code_lines.append('')
            i += 1
            continue
        
        # Handle listitem
        if 'listitem' in stripped:
            i += 1
            continue
        
        # Handle code references (inline code)
        if '- code ' in stripped and 'textbox' not in stripped:
            i += 1
            continue
        
        i += 1
    
    # Flush remaining
    save_message()
    
    return conversation


def parts_to_markdown(parts):
    """Convert parts list to markdown text."""
    result = []
    
    for part in parts:
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
        elif part[0] == 'break':
            result.append('\n\n')
        elif part[0] == 'separator':
            result.append('\n\n---\n\n')
        elif part[0] == 'table':
            rows = part[1]
            if rows:
                # Format as markdown table
                for j, row in enumerate(rows):
                    result.append('| ' + ' | '.join(row) + ' |\n')
                    if j == 0:
                        result.append('| ' + ' | '.join(['---'] * len(row)) + ' |\n')
                result.append('\n')
    
    return ''.join(result)


def build_markdown(conversation):
    """Build the final markdown document from conversation parts."""
    md = ['# DevMind Agent - Chat con GLM-4.7', '', '---', '']
    
    for i, (role, parts) in enumerate(conversation):
        if role == 'user':
            md.append('## 👤 Usuario')
            md.append('')
        else:
            md.append('## 🤖 GLM-4.7')
            md.append('')
        
        text = parts_to_markdown(parts)
        # Clean up excessive whitespace
        text = re.sub(r'\n{4,}', '\n\n\n', text)
        md.append(text.strip())
        md.append('')
        md.append('---')
        md.append('')
    
    return '\n'.join(md)


# Run
if __name__ == '__main__':
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    conversation = parse_accessibility_tree(filepath)
    
    print(f"Extracted {len(conversation)} messages")
    for i, (role, parts) in enumerate(conversation):
        preview = parts_to_markdown(parts)[:200].replace('\n', ' ')
        print(f"  [{i}] {role}: {preview}...")
    
    md = build_markdown(conversation)
    
    with open('/home/z/my-project/download/chat_devmind_extracted.md', 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"\nWrote {len(md)} chars to output file")
