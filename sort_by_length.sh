#!/bin/bash
# Usage: ./sort_by_length.sh input.txt output.txt

input="$1"
output="$2"

# Check if input file exists
if [ ! -f "$input" ]; then
  echo "Error: Input file not found."
  exit 1
fi

# Sort lines by their length (preserving empty lines)
awk '{ print length, $0 }' "$input" | sort -n | cut -d" " -f2- > "$output"

echo "Sorted file saved to $output"
