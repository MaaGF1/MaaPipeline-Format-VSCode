#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maa Pipeline JSON Formatter for VS Code Extension
Adapts the main formatter for stdin/stdout processing
"""

import json
import re
import sys
from typing import Any, Dict, List, Union, Tuple, Optional


# ============================================================================
# Configuration (simplified for VS Code extension)
# ============================================================================

VSCODE_CONFIG = {
    "version": "1.0",
    "indent": {
        "style": "tab",
        "width": 1
    },
    "formatting": {
        "simple_array_threshold": 50,
        "coordinate_fields": [
            "roi", "roi_offset", "target", "target_offset",
            "begin", "begin_offset", "end", "end_offset",
            "lower", "upper"
        ],
        "control_flow_fields": [
            "next", "interrupt", "on_error", "template"
        ],
        "always_multiline_fields": [
            "custom_action_param", "custom_param",
            "parameters", "params", "options", "config"
        ]
    },
    "file_handling": {
        "preserve_comments": True,
        "encoding": "utf-8",
        "newline": "LF"
    }
}


# ============================================================================
# Maa Pipeline Formatter (from your main.py)
# ============================================================================

class MaaPipelineFormatter:
    """MaaFramework Pipeline JSON Formatter"""
    
    def __init__(self, config: Optional[Dict] = None):
        if config is None:
            config = VSCODE_CONFIG.copy()
        
        self.config = config
        
        indent_cfg = config["indent"]
        indent_char = "\t" if indent_cfg["style"] == "tab" else " "
        indent_width = indent_cfg["width"]
        self.indent = indent_char * indent_width
        
        fmt_cfg = config["formatting"]
        self.coordinate_fields = set(fmt_cfg["coordinate_fields"])
        self.control_flow_fields = set(fmt_cfg["control_flow_fields"])
        self.always_multiline_fields = set(fmt_cfg["always_multiline_fields"])
        self.simple_array_threshold = fmt_cfg["simple_array_threshold"]
        
        fh_cfg = config["file_handling"]
        self.preserve_comments = fh_cfg["preserve_comments"]
        self.encoding = fh_cfg["encoding"]
        self.newline = "\r\n" if fh_cfg["newline"] == "CRLF" else "\n"
    
    def _is_simple_value(self, value: Any) -> bool:
        return isinstance(value, (str, int, float, bool, type(None)))
    
    def _is_coordinate_array(self, key: str, value: Any) -> bool:
        if key not in self.coordinate_fields:
            return False
        if not isinstance(value, list):
            return False
        return all(isinstance(v, (int, float)) for v in value)
    
    def _should_inline_array(self, key: str, value: List) -> bool:
        if not value:
            return True
        
        if self._is_coordinate_array(key, value):
            return True
        
        if key in self.control_flow_fields:
            return False
        
        if all(self._is_simple_value(v) for v in value):
            inline_str = json.dumps(value, ensure_ascii=False)
            return len(inline_str) <= self.simple_array_threshold
        
        return False
    
    def _should_inline_object(self, key: str, value: Dict) -> bool:
        if not value:
            return True
        
        if key in self.always_multiline_fields:
            return False
        
        if all(self._is_simple_value(v) for v in value.values()):
            inline_str = json.dumps(value, ensure_ascii=False)
            return len(inline_str) <= self.simple_array_threshold
        
        return False
    
    def _format_value(self, key: str, value: Any, indent_level: int, parent_is_root: bool = False) -> str:
        if self._is_simple_value(value):
            return json.dumps(value, ensure_ascii=False)
        
        if isinstance(value, list):
            if self._should_inline_array(key, value):
                return json.dumps(value, ensure_ascii=False)
            else:
                lines = ["["]
                for i, item in enumerate(value):
                    item_str = self._format_value("", item, indent_level + 1)
                    comma = "," if i < len(value) - 1 else ""
                    lines.append(f"{self.indent * (indent_level + 1)}{item_str}{comma}")
                lines.append(f"{self.indent * indent_level}]")
                return "\n".join(lines)
        
        if isinstance(value, dict):
            if parent_is_root:
                return self._format_object(value, indent_level, is_root=False)
            
            if self._should_inline_object(key, value):
                return json.dumps(value, ensure_ascii=False)
            else:
                return self._format_object(value, indent_level, is_root=False)
        
        return json.dumps(value, ensure_ascii=False)
    
    def _format_object(self, obj: Dict, indent_level: int, is_root: bool = False) -> str:
        if not obj:
            return "{}"
        
        lines = ["{"]
        items = list(obj.items())
        
        for i, (key, value) in enumerate(items):
            key_str = json.dumps(key, ensure_ascii=False)
            value_str = self._format_value(key, value, indent_level + 1, parent_is_root=is_root)
            comma = "," if i < len(items) - 1 else ""
            
            if "\n" in value_str:
                lines.append(f"{self.indent * (indent_level + 1)}{key_str}: {value_str}{comma}")
            else:
                lines.append(f"{self.indent * (indent_level + 1)}{key_str}: {value_str}{comma}")
        
        lines.append(f"{self.indent * indent_level}}}")
        return "\n".join(lines)
    
    def _preserve_comments(self, original_text: str, formatted_text: str) -> str:
        original_lines = original_text.split('\n')
        formatted_lines = formatted_text.split('\n')
        
        comment_map = {}
        current_comments = []
        
        for line in original_lines:
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
                current_comments.append(line.rstrip())
            elif '"' in stripped and ':' in stripped:
                match = re.search(r'"([^"]+)"\s*:', stripped)
                if match:
                    node_name = match.group(1)
                    if current_comments:
                        comment_map[node_name] = current_comments.copy()
                        current_comments = []
        
        result_lines = []
        for line in formatted_lines:
            match = re.search(r'"([^"]+)"\s*:', line)
            if match:
                node_name = match.group(1)
                if node_name in comment_map:
                    indent = len(line) - len(line.lstrip())
                    for comment in comment_map[node_name]:
                        result_lines.append(' ' * indent + comment.lstrip())
            result_lines.append(line)
        
        return '\n'.join(result_lines)
    
    def _remove_comments(self, text: str) -> str:
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        return text
    
    def format_text(self, text: str) -> Tuple[bool, str, str]:
        try:
            text_without_comments = self._remove_comments(text)
            
            try:
                data = json.loads(text_without_comments)
            except json.JSONDecodeError as e:
                return False, "", f"JSON parse error: {e}"
            
            formatted = self._format_object(data, 0, is_root=True)
            
            if self.preserve_comments:
                try:
                    final_text = self._preserve_comments(text, formatted)
                except Exception:
                    final_text = formatted
            else:
                final_text = formatted
            
            return True, final_text, ""
            
        except Exception as e:
            return False, "", str(e)


# ============================================================================
# VS Code Extension Interface
# ============================================================================

def main():
    """Main function for VS Code extension"""
    try:
        # Read input from stdin
        input_text = sys.stdin.read()
        
        if not input_text.strip():
            print("Error: No input provided", file=sys.stderr)
            sys.exit(1)
        
        # Create formatter
        formatter = MaaPipelineFormatter()
        
        # Format the text
        success, formatted_text, error_msg = formatter.format_text(input_text)
        
        if success:
            # Output formatted text to stdout
            print(formatted_text, end='')
            sys.exit(0)
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()