#!/usr/bin/env python3
"""Extract clean chat content from accessibility tree snapshots."""

import re
import os

def extract_from_a11y_tree(filepath):
    """Parse accessibility tree format and extract conversation text."""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    messages = []
    current_role = None
    current_text_parts = []
    in_code_block = False
    code_block_parts = []
    code_lang = None
    
    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')
        stripped = line.strip()
        
        # Skip structural elements
        if stripped.startswith('- generic') or stripped.startswith('- image') or stripped.startswith('- separator'):
            i += 1
            continue
        
        # Detect user messages (StaticText that isn't inside a GLM response block)
        # Detect GLM label
        if 'StaticText "GLM-4.7"' in stripped:
            if current_role == 'user' and current_text_parts:
                text = ' '.join(current_text_parts).strip()
                if text:
                    messages.append(('user', text))
                current_text_parts = []
            current_role = 'glm'
            i += 1
            continue
        
        # Detect user message area - typically before GLM response
        # User messages appear as StaticText at a certain indent level
        # They come before the GLM-4.7 label
        
        # Handle Thought Process button
        if 'button "Thought Process"' in stripped:
            i += 1
            continue
        
        # Handle Copy button
        if 'generic "Copy"' in stripped or 'button "Copy"' in stripped:
            i += 1
            continue
        
        # Handle headings
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            heading_text = heading_match.group(1)
            level = int(heading_match.group(2))
            if current_role:
                current_text_parts.append(f"\n{'#' * level} {heading_text}\n")
            i += 1
            continue
        
        # Handle StaticText
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1)
            # Unescape
            text = text.replace('\\"', '"').replace('\\n', '\n')
            
            # Skip UI artifacts
            if text in ['Loading...', 'Agent Loop with Tools and Prompts', 'Thought Process', 'Copy', 'Show full message', 'profile']:
                i += 1
                continue
            
            # Detect if this is a user message (usually appears before GLM-4.7 label)
            if current_role is None or current_role == 'glm_end':
                # This might be a user message
                current_role = 'user'
            
            current_text_parts.append(text)
            i += 1
            continue
        
        # Handle strong text
        strong_match = re.search(r'- strong$', stripped)
        if strong_match:
            i += 1
            continue
        
        # Handle emphasis
        if stripped == '- emphasis':
            i += 1
            continue
        
        # Handle code references (inline code)
        code_match = re.search(r'- code \[ref=', stripped)
        if code_match:
            i += 1
            continue
        
        # Handle code blocks (textbox)
        if 'textbox [' in stripped:
            # This is a code block - extract the content
            # The content may be on this line after the colon
            code_content = stripped.split(']:', 1)
            if len(code_content) > 1:
                code_text = code_content[1].strip()
                if code_text and current_role:
                    current_text_parts.append(f"\n```\n{code_text}\n```\n")
            i += 1
            continue
        
        # Handle list items
        if 'listitem' in stripped:
            i += 1
            continue
        
        # Handle ListMarker
        marker_match = re.search(r'ListMarker "(.*?)"', stripped)
        if marker_match:
            marker = marker_match.group(1)
            if current_role:
                current_text_parts.append(f"\n{marker}")
            i += 1
            continue
        
        # Handle table elements
        if any(x in stripped for x in ['columnheader', '- row', '- cell', 'rowgroup']):
            cell_match = re.search(r'(?:columnheader|cell) "(.*?)"', stripped)
            if cell_match:
                cell_text = cell_match.group(1)
                if current_role:
                    current_text_parts.append(f" | {cell_text}")
            i += 1
            continue
        
        # Handle paragraph
        if stripped == '- paragraph':
            if current_role and current_text_parts:
                current_text_parts.append('\n')
            i += 1
            continue
        
        # Handle list
        if stripped == '- list':
            i += 1
            continue
        
        i += 1
    
    # Flush remaining
    if current_role and current_text_parts:
        text = ' '.join(current_text_parts).strip()
        if text:
            messages.append((current_role, text))
    
    return messages


def extract_from_plain(filepath):
    """Extract from the plain text version (bash result)."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    # Remove line number prefixes
    clean_lines = []
    for line in lines:
        # Remove line number prefix like "   123→"
        match = re.match(r'\s*\d+→(.*)', line)
        if match:
            clean_lines.append(match.group(1))
        else:
            clean_lines.append(line)
    
    return '\n'.join(clean_lines)


# Let's try a different, more robust approach: process the accessibility tree
# by reading it as a structured document and extracting text with proper context

def parse_a11y_comprehensive(filepath):
    """More comprehensive parser that tracks indentation to understand structure."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    # First pass: identify conversation blocks
    # The structure is:
    # - generic (user message container)
    #   - generic
    #     - StaticText "user message"
    #     - generic "Copy"
    # - generic (GLM response container)
    #   - image "profile"
    #   - generic "GLM-4.7"
    #   - button "Thought Process"
    #   - paragraph / heading / list / code / table
    
    messages = []
    all_text = []
    in_user_block = False
    in_glm_block = False
    indent_level = 0
    block_indent = 0
    
    # Collect all text with context
    for line in lines:
        stripped = line.strip()
        
        # Calculate indent level
        indent = len(line) - len(line.lstrip(' -'))
        
        # Check for user message markers
        if 'StaticText "GLM-4.7"' in stripped:
            # Previous user message ended
            if all_text and not in_glm_block:
                pass
            in_glm_block = True
            in_user_block = False
            continue
        
        # Skip structural/UI elements
        if any(skip in stripped for skip in [
            '- generic', '- image', '- separator', 'button "Thought Process"',
            'button "Copy"', 'generic "Copy"', 'button "Show full message"',
            '- strong', '- emphasis', '- paragraph', '- list', '- listitem',
            'ListMarker', 'ref=e', 'focusable', 'tabindex', 'clickable',
            'cursor:pointer', 'textbox [', '- rowgroup', '- row',
        ]):
            # But extract text from some of these
            static_match = re.search(r'StaticText "(.*?)"', stripped)
            if static_match:
                text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
                if text not in ['Loading...', 'Agent Loop with Tools and Prompts', 'Thought Process', 'Copy', 'Show full message', 'profile', 'GLM-4.7']:
                    all_text.append(('text', text))
            
            cell_match = re.search(r'(?:columnheader|cell) "(.*?)"', stripped)
            if cell_match:
                text = cell_match.group(1).replace('\\"', '"').replace('\\n', '\n')
                all_text.append(('cell', text))
            
            heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
            if heading_match:
                text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
                level = int(heading_match.group(2))
                all_text.append(('heading', (level, text)))
            
            code_match = re.search(r'- code \[ref=', stripped)
            if code_match:
                # Next StaticText is the code content
                pass
            
            marker_match = re.search(r'ListMarker "(.*?)"', stripped)
            if marker_match:
                text = marker_match.group(1)
                all_text.append(('marker', text))
            
            continue
        
        # Extract StaticText
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            if text not in ['Loading...', 'Agent Loop with Tools and Prompts', 'Thought Process', 'Copy', 'Show full message', 'profile', 'GLM-4.7']:
                all_text.append(('text', text))
    
    return all_text


# Actually, let me try the simplest possible approach: read the file and extract 
# only the text content, preserving the conversation flow

def extract_clean(filepath):
    """Extract clean text by pulling all StaticText and structural markers."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    # Strategy: Track conversation structure by detecting:
    # 1. User messages: appear as StaticText before GLM-4.7 label
    # 2. GLM responses: everything after GLM-4.7 label until next user message
    
    conversation = []
    current_speaker = None
    current_content = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Detect GLM-4.7 label - marks start of GLM response
        if 'StaticText "GLM-4.7"' in stripped:
            # Save previous user message if any
            if current_speaker == 'user' and current_content:
                text = assemble_content(current_content)
                if text.strip():
                    conversation.append(('user', text))
                current_content = []
            current_speaker = 'glm'
            i += 1
            continue
        
        # Detect "Copy" button after user message
        if 'generic "Copy"' in stripped and current_speaker != 'glm':
            # This marks end of a user message area
            i += 1
            continue
        
        # Detect next user message (StaticText at certain level before GLM label)
        # This is tricky - user messages appear as top-level StaticText
        
        # Extract headings
        heading_match = re.search(r'heading "(.*?)"\s*\[level=(\d+)', stripped)
        if heading_match:
            text = heading_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            level = int(heading_match.group(2))
            if current_speaker:
                current_content.append(('heading', level, text))
            i += 1
            continue
        
        # Extract table cells
        cell_match = re.search(r'(?:columnheader|cell) "(.*?)"', stripped)
        if cell_match:
            text = cell_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            if current_speaker:
                current_content.append(('cell', text))
            i += 1
            continue
        
        # Extract list markers
        marker_match = re.search(r'ListMarker "(.*?)"', stripped)
        if marker_match:
            text = marker_match.group(1)
            if current_speaker:
                current_content.append(('marker', text))
            i += 1
            continue
        
        # Extract StaticText
        static_match = re.search(r'StaticText "(.*?)"', stripped)
        if static_match:
            text = static_match.group(1).replace('\\"', '"').replace('\\n', '\n')
            # Skip UI artifacts
            if text in ['Loading...', 'Agent Loop with Tools and Prompts', 'Thought Process', 'Copy', 'Show full message', 'profile', 'GLM-4.7']:
                i += 1
                continue
            if current_speaker is None:
                # This is a user message
                current_speaker = 'user'
            current_content.append(('text', text))
            i += 1
            continue
        
        # Extract code block content (textbox)
        textbox_match = re.search(r'textbox \[ref=\w+\]: (.*)', stripped)
        if textbox_match:
            code_text = textbox_match.group(1)
            if current_speaker:
                current_content.append(('code', code_text))
            i += 1
            continue
        
        # Check for multi-line code content inside textbox areas
        # These are lines after a textbox that contain code
        if current_speaker and current_content and current_content[-1][0] == 'code':
            # Check if this line looks like code continuation
            if stripped and not stripped.startswith('-') and not stripped.startswith('StaticText'):
                # Could be code continuation
                pass
        
        # Detect separator between sections
        if stripped == '- separator':
            if current_speaker:
                current_content.append(('separator',))
            i += 1
            continue
        
        # Detect paragraph boundary
        if stripped == '- paragraph':
            if current_speaker and current_content:
                last = current_content[-1]
                if last[0] == 'text':
                    current_content.append(('break',))
            i += 1
            continue
        
        # Detect line breaks in code
        linebreak_match = re.search(r'LineBreak "(.*?)"', stripped)
        if linebreak_match:
            if current_speaker:
                current_content.append(('newline',))
            i += 1
            continue
        
        # Detect "Show full message" - marks end of a message
        if 'button "Show full message"' in stripped:
            i += 1
            continue
        
        # Detect next user message block
        # After GLM content ends, if we see a new generic block with StaticText,
        # that's a new user message
        if stripped.startswith('- generic') and current_speaker == 'glm':
            # Check if next lines contain user message or more GLM content
            # Look ahead
            lookahead_lines = []
            for j in range(i+1, min(i+10, len(lines))):
                lookahead_lines.append(lines[j].strip())
            lookahead = ' '.join(lookahead_lines)
            
            # If we see "GLM-4.7" in lookahead, current GLM message ends here
            # and a new exchange begins
            if 'GLM-4.7' in lookahead:
                # Save current GLM message
                text = assemble_content(current_content)
                if text.strip():
                    conversation.append(('glm', text))
                current_content = []
                current_speaker = None  # Will be set by user message detection
            i += 1
            continue
        
        i += 1
    
    # Save any remaining content
    if current_speaker and current_content:
        text = assemble_content(current_content)
        if text.strip():
            conversation.append((current_speaker, text))
    
    return conversation


def assemble_content(parts):
    """Assemble content parts into readable text."""
    result = []
    in_table = False
    table_rows = []
    current_row = []
    
    for part in parts:
        if part[0] == 'heading':
            level = part[1]
            text = part[2]
            if in_table and current_row:
                table_rows.append(current_row)
                current_row = []
            if in_table and table_rows:
                result.append(format_table(table_rows))
                table_rows = []
                in_table = False
            result.append(f"\n{'#' * level} {text}\n")
        elif part[0] == 'text':
            if in_table and current_row:
                table_rows.append(current_row)
                current_row = []
            if in_table and table_rows:
                result.append(format_table(table_rows))
                table_rows = []
                in_table = False
            result.append(part[1])
        elif part[0] == 'cell':
            in_table = True
            current_row.append(part[1])
        elif part[0] == 'marker':
            result.append(f"\n{part[1]}")
        elif part[0] == 'code':
            result.append(f"\n```\n{part[1]}\n```\n")
        elif part[0] == 'separator':
            if in_table and current_row:
                table_rows.append(current_row)
                current_row = []
            if in_table and table_rows:
                result.append(format_table(table_rows))
                table_rows = []
                in_table = False
            result.append("\n---\n")
        elif part[0] == 'break':
            result.append('\n')
        elif part[0] == 'newline':
            result.append('\n')
    
    # Flush remaining table
    if in_table:
        if current_row:
            table_rows.append(current_row)
        if table_rows:
            result.append(format_table(table_rows))
    
    return ''.join(result)


def format_table(rows):
    """Format table rows as markdown table."""
    if not rows:
        return ''
    
    lines = []
    for i, row in enumerate(rows):
        line = '| ' + ' | '.join(row) + ' |'
        lines.append(line)
        if i == 0:
            sep = '| ' + ' | '.join(['---'] * len(row)) + ' |'
            lines.append(sep)
    
    return '\n' + '\n'.join(lines) + '\n'


# Run extraction
if __name__ == '__main__':
    filepath = '/home/z/my-project/download/chat_snapshot.txt'
    conversation = extract_clean(filepath)
    
    print(f"Extracted {len(conversation)} messages")
    for i, (role, text) in enumerate(conversation):
        preview = text[:100].replace('\n', ' ')
        print(f"  [{i}] {role}: {preview}...")
