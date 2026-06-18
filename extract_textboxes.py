#!/usr/bin/env python3
"""Extract textbox code block contents from accessibility tree."""

import re

with open('/home/z/my-project/download/chat_snapshot.txt', 'r') as f:
    lines = f.readlines()

# Find textbox lines and extract their multi-line content
textboxes = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    
    textbox_match = re.match(r'\s*- textbox \[\w+\]: (.*)', line)
    if textbox_match:
        first_line = textbox_match.group(1)
        code_lines = [first_line]
        
        # Continue reading subsequent lines that are part of the code
        j = i + 1
        while j < len(lines):
            next_line = lines[j]
            next_stripped = next_line.strip()
            
            # Check if this line is a structural element that ends the textbox
            if next_stripped.startswith('- ') and any(next_stripped.startswith(f'- {t}') for t in [
                'StaticText', 'generic', 'LineBreak', 'separator', 'heading', 
                'paragraph', 'button', 'list', 'listitem', 'table', 'row',
                'columnheader', 'cell', 'emphasis', 'strong', 'code ', 'image'
            ]):
                break
            
            # If it's just a code line (no leading dash structure)
            if next_stripped and not next_stripped.startswith('- '):
                code_lines.append(next_stripped)
            elif not next_stripped:
                # Empty line might be part of code
                pass
            else:
                break
            
            j += 1
        
        textboxes.append((i+1, code_lines))
        i = j
    else:
        i += 1

print(f"Found {len(textboxes)} code blocks")
for idx, (line_num, code_lines) in enumerate(textboxes):
    print(f"\n{'='*60}")
    print(f"Code block {idx+1} (line {line_num}, {len(code_lines)} lines)")
    print(f"{'='*60}")
    for cl in code_lines[:5]:
        print(f"  {cl}")
    if len(code_lines) > 10:
        print(f"  ... ({len(code_lines)-10} more lines)")
        for cl in code_lines[-5:]:
            print(f"  {cl}")
    elif len(code_lines) > 5:
        for cl in code_lines[5:]:
            print(f"  {cl}")
