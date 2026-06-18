#!/usr/bin/env python3
"""Analyze the structure of the accessibility tree to understand conversation layout."""

import re

filepath = '/home/z/my-project/download/chat_snapshot.txt'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# Find all GLM-4.7 labels and their context
for i, line in enumerate(lines):
    stripped = line.strip()
    if 'GLM-4.7' in stripped:
        print(f"Line {i+1}: {stripped[:120]}")
        # Show surrounding context
        for j in range(max(0, i-5), min(len(lines), i+5)):
            print(f"  {j+1}: {lines[j].strip()[:120]}")
        print()

# Find all "Copy" references (they mark end of message blocks)
print("\n=== COPY markers ===")
for i, line in enumerate(lines):
    stripped = line.strip()
    if 'generic "Copy"' in stripped:
        print(f"Line {i+1}: {stripped[:120]}")

# Find user-like messages (StaticText at shallow indent)
print("\n=== Potential user messages (shallow StaticText) ===")
for i, line in enumerate(lines):
    stripped = line.strip()
    # Calculate indent
    indent = len(line) - len(line.lstrip(' -'))
    if 'StaticText' in stripped and indent < 20 and 'GLM-4.7' not in stripped:
        text_match = re.search(r'StaticText "(.*?)"', stripped)
        if text_match:
            text = text_match.group(1)[:80]
            if text not in ['Loading...', 'Agent Loop with Tools and Prompts', 'Thought Process', 'Copy', 'Show full message', 'profile']:
                print(f"  Line {i+1} (indent={indent}): {text}")

