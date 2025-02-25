#!/bin/bash

while IFS= read -r target || [[ -n "$target" ]]; do
    echo "Calling node script with target: $target"
    node index.js "$target" a2
done < words.txt
