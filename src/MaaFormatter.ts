import * as vscode from 'vscode';

// ============================================================================
// Configuration Types & Defaults
// ============================================================================

export interface MaaFormatConfig {
    version?: string;
    indent: {
        style: "space" | "tab";
        width: number;
    };
    posix: {
        insert_final_newline: boolean;
    };
    formatting: {
        simple_array_threshold: number;
        coordinate_fields: string[];
        control_flow_fields: string[];
        always_multiline_fields: string[];
    };
    file_handling: {
        preserve_comments: boolean;
        output_suffix: string;
        encoding: string;
        newline: "LF" | "CRLF";
    };
}

export const DEFAULT_CONFIG: MaaFormatConfig = {
    version: "1.0",
    indent: {
        style: "tab",
        width: 1
    },
    posix: {
        insert_final_newline: false
    },
    formatting: {
        simple_array_threshold: 50,
        coordinate_fields: [
            "roi",
            "roi_offset",
            "target",
            "target_offset",
            "begin",
            "begin_offset",
            "end",
            "end_offset",
            "lower",
            "upper"
        ],
        control_flow_fields: [
            "next",
            "interrupt",
            "on_error",
            "template"
        ],
        always_multiline_fields: [
            "custom_action_param",
            "custom_param",
            "parameters",
            "params",
            "options",
            "config"
        ]
    },
    file_handling: {
        preserve_comments: true,
        output_suffix: "",
        encoding: "utf-8",
        newline: "LF"
    }
};

// ============================================================================
// Lexer / Parser / AST
// ============================================================================

enum TokenType {
    LBRACE,    // {
    RBRACE,    // }
    LBRACKET,  // [
    RBRACKET,  // ]
    COLON,     // :
    COMMA,     // ,
    STRING,    // "string"
    NUMBER,    // 123, -4.5
    BOOLEAN,   // true, false
    NULL,      // null
    COMMENT,   // // or /* */
    WHITESPACE
}

class Token {
    constructor(
        public type: TokenType,
        public value: string,
        public line: number
    ) {}
}

abstract class AstNode {}

class JsonValue extends AstNode {
    constructor(public value: any, public rawText: string) { super(); }
}

class JsonString extends JsonValue {}
class JsonNumber extends JsonValue {}
class JsonBoolean extends JsonValue {}
class JsonNull extends JsonValue {}

class JsonComment extends AstNode {
    constructor(public text: string, public isBlock: boolean) { super(); }
}

class JsonArray extends AstNode {
    public children: AstNode[] = [];
}

class JsonObject extends AstNode {
    // Children are either a Key-Value pair or a Comment
    public children: (JsonComment | { key: string; value: AstNode })[] = [];
}

class MaaLexer {
    private pos = 0;
    private line = 1;
    private tokens: Token[] = [];
    
    // Fixed Regex Patterns with proper escaping
    private static PATTERNS: { type: TokenType; regex: RegExp }[] = [
        { type: TokenType.COMMENT, regex: /\/\/.*|\/\*[\s\S]*?\*\//y },
        { type: TokenType.STRING, regex: /"(?:\\.|[^"])*"/y },
        { type: TokenType.NUMBER, regex: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
        { type: TokenType.BOOLEAN, regex: /true|false/y },
        { type: TokenType.NULL, regex: /null/y },
        { type: TokenType.LBRACE, regex: /\{/y },
        { type: TokenType.RBRACE, regex: /\}/y },
        { type: TokenType.LBRACKET, regex: /\[/y },
        { type: TokenType.RBRACKET, regex: /\]/y },
        { type: TokenType.COLON, regex: /:/y },
        { type: TokenType.COMMA, regex: /,/y },
        { type: TokenType.WHITESPACE, regex: /\s+/y },
    ];

    constructor(private text: string) {}

    public tokenize(): Token[] {
        while (this.pos < this.text.length) {
            let matched = false;

            for (const { type, regex } of MaaLexer.PATTERNS) {
                regex.lastIndex = this.pos;
                const match = regex.exec(this.text);

                if (match) {
                    const value = match[0];
                    if (type !== TokenType.WHITESPACE) {
                        this.tokens.push(new Token(type, value, this.line));
                    }

                    // Update line count
                    const newLines = (value.match(/\n/g) || []).length;
                    this.line += newLines;
                    this.pos += value.length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new Error(`Unexpected character at line ${this.line}: ${this.text[this.pos]}`);
            }
        }
        return this.tokens;
    }
}

class MaaParser {
    private pos = 0;

    constructor(private tokens: Token[]) {}

    private peek(): Token | null {
        return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
    }

    private consume(expectedType?: TokenType): Token {
        const token = this.peek();
        if (!token) {
            throw new Error("Unexpected end of input");
        }
        if (expectedType !== undefined && token.type !== expectedType) {
            throw new Error(`Expected token type ${expectedType}, got ${token.type} at line ${token.line}`);
        }
        this.pos++;
        return token;
    }

    public parse(): AstNode {
        const rootComments: JsonComment[] = [];
        
        while (this.peek()?.type === TokenType.COMMENT) {
            rootComments.push(this.parseComment());
        }

        if (!this.peek()) {
            const root = new JsonObject();
            root.children = rootComments;
            return root;
        }

        const root = this.parseValue();

        if (root instanceof JsonObject || root instanceof JsonArray) {
            root.children.unshift(...rootComments);
        }

        return root;
    }

    private parseValue(): AstNode {
        const token = this.peek();
        if (!token) throw new Error("Unexpected end of input");

        switch (token.type) {
            case TokenType.LBRACE:
                return this.parseObject();
            case TokenType.LBRACKET:
                return this.parseArray();
            case TokenType.STRING: {
                const t = this.consume();
                return new JsonString(JSON.parse(t.value), t.value);
            }
            case TokenType.NUMBER: {
                const t = this.consume();
                const val = parseFloat(t.value);
                return new JsonNumber(val, t.value);
            }
            case TokenType.BOOLEAN: {
                const t = this.consume();
                return new JsonBoolean(t.value === 'true', t.value);
            }
            case TokenType.NULL: {
                const t = this.consume();
                return new JsonNull(null, t.value);
            }
            case TokenType.COMMENT:
                return this.parseComment();
            default:
                throw new Error(`Unexpected token ${token.value} at line ${token.line}`);
        }
    }

    private parseComment(): JsonComment {
        const token = this.consume(TokenType.COMMENT);
        const isBlock = token.value.startsWith('/*');
        return new JsonComment(token.value, isBlock);
    }

    private parseObject(): JsonObject {
        this.consume(TokenType.LBRACE);
        const obj = new JsonObject();

        while (true) {
            const token = this.peek();
            if (!token) throw new Error("Unclosed object");

            if (token.type === TokenType.RBRACE) {
                this.consume();
                break;
            }

            if (token.type === TokenType.COMMENT) {
                obj.children.push(this.parseComment());
                continue;
            }

            if (token.type === TokenType.COMMA) {
                this.consume();
                continue;
            }

            if (token.type === TokenType.STRING) {
                const keyToken = this.consume();
                const keyStr = JSON.parse(keyToken.value);

                while (this.peek()?.type === TokenType.COMMENT) {
                    obj.children.push(this.parseComment());
                }

                this.consume(TokenType.COLON);

                while (this.peek()?.type === TokenType.COMMENT) {
                    obj.children.push(this.parseComment());
                }

                const value = this.parseValue();
                obj.children.push({ key: keyStr, value: value });
            } else {
                throw new Error(`Expected string key or comment in object, got ${token.value}`);
            }
        }
        return obj;
    }

    private parseArray(): JsonArray {
        this.consume(TokenType.LBRACKET);
        const arr = new JsonArray();

        while (true) {
            const token = this.peek();
            if (!token) throw new Error("Unclosed array");

            if (token.type === TokenType.RBRACKET) {
                this.consume();
                break;
            }

            if (token.type === TokenType.COMMENT) {
                arr.children.push(this.parseComment());
                continue;
            }

            if (token.type === TokenType.COMMA) {
                this.consume();
                continue;
            }

            const val = this.parseValue();
            arr.children.push(val);
        }
        return arr;
    }
}

// ============================================================================
// Formatter
// ============================================================================

export class MaaPipelineFormatter {
    private indentStr: string;
    private coordinateFields: Set<string>;
    private controlFlowFields: Set<string>;
    private alwaysMultilineFields: Set<string>;

    constructor(private config: MaaFormatConfig) {
        const indentChar = config.indent.style === "tab" ? "\t" : " ";
        this.indentStr = indentChar.repeat(config.indent.width);
        
        this.coordinateFields = new Set(config.formatting.coordinate_fields);
        this.controlFlowFields = new Set(config.formatting.control_flow_fields);
        this.alwaysMultilineFields = new Set(config.formatting.always_multiline_fields);
    }

    public format(text: string): string {
        const lexer = new MaaLexer(text);
        const tokens = lexer.tokenize();
        const parser = new MaaParser(tokens);
        const ast = parser.parse();

        let formatted = this.formatNode(ast, 0, "");

        if (this.config.posix.insert_final_newline) {
            if (formatted && !formatted.endsWith('\n')) {
                formatted += '\n';
            }
        } else {
            if (formatted && formatted.endsWith('\n')) {
                formatted = formatted.trimEnd();
            }
        }

        const newline = this.config.file_handling.newline === "CRLF" ? "\r\n" : "\n";
        return formatted.replace(/\r?\n/g, newline);
    }

    private isCoordinateArray(key: string, node: JsonArray): boolean {
        if (!this.coordinateFields.has(key)) return false;
        for (const child of node.children) {
            if (child instanceof JsonComment) return false;
            if (!(child instanceof JsonNumber)) return false;
        }
        return true;
    }

    private shouldInlineArray(key: string, node: JsonArray): boolean {
        if (node.children.length === 0) return true;

        if (node.children.some(c => c instanceof JsonComment || c instanceof JsonObject || c instanceof JsonArray)) {
            return false;
        }

        if (this.isCoordinateArray(key, node)) return true;
        if (this.controlFlowFields.has(key)) return false;

        const tempStr = this.formatInlineArray(node);
        return tempStr.length <= this.config.formatting.simple_array_threshold;
    }

    private shouldInlineObject(key: string, node: JsonObject): boolean {
        if (node.children.length === 0) return true;
        if (this.alwaysMultilineFields.has(key)) return false;

        if (node.children.some(c => c instanceof JsonComment)) return false;

        for (const child of node.children) {
            if (!(child instanceof JsonComment)) {
                if (child.value instanceof JsonObject || child.value instanceof JsonArray) {
                    return false;
                }
            }
        }

        const tempStr = this.formatInlineObject(node);
        return tempStr.length <= this.config.formatting.simple_array_threshold;
    }

    private formatInlineArray(node: JsonArray): string {
        const parts: string[] = [];
        for (const child of node.children) {
            parts.push(this.formatNode(child, 0, "", true));
        }
        return "[" + parts.join(", ") + "]";
    }

    private formatInlineObject(node: JsonObject): string {
        const parts: string[] = [];
        for (const child of node.children) {
            if (!(child instanceof JsonComment)) {
                const kStr = JSON.stringify(child.key);
                const vStr = this.formatNode(child.value, 0, "", true);
                parts.push(`${kStr}: ${vStr}`);
            }
        }
        return "{" + parts.join(", ") + "}";
    }

    private formatNode(node: AstNode, level: number, parentKey: string, inlineMode: boolean = false): string {
        if (node instanceof JsonValue) {
            return JSON.stringify(node.value);
        }

        if (node instanceof JsonComment) {
            if (inlineMode) return "";
            return node.text;
        }

        if (node instanceof JsonArray) {
            if (inlineMode) return this.formatInlineArray(node);
            if (this.shouldInlineArray(parentKey, node)) return this.formatInlineArray(node);

            const lines: string[] = ["["];
            const indent = this.indentStr.repeat(level + 1);

            const valueIndices = node.children
                .map((c, i) => (c instanceof JsonComment ? -1 : i))
                .filter(i => i !== -1);
            const lastValueIdx = valueIndices.length > 0 ? valueIndices[valueIndices.length - 1] : -1;

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childStr = this.formatNode(child, level + 1, "");

                if (child instanceof JsonComment) {
                    lines.push(`${indent}${childStr}`);
                } else {
                    const comma = (i < node.children.length && i !== lastValueIdx) ? "," : "";
                    lines.push(`${indent}${childStr}${comma}`);
                }
            }
            lines.push(`${this.indentStr.repeat(level)}]`);
            return lines.join("\n");
        }

        if (node instanceof JsonObject) {
            if (inlineMode) return this.formatInlineObject(node);
            if (this.shouldInlineObject(parentKey, node)) return this.formatInlineObject(node);

            const lines: string[] = ["{"];
            const indent = this.indentStr.repeat(level + 1);

            const valueIndices = node.children
                .map((c, i) => (c instanceof JsonComment ? -1 : i))
                .filter(i => i !== -1);
            const lastValueIdx = valueIndices.length > 0 ? valueIndices[valueIndices.length - 1] : -1;

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child instanceof JsonComment) {
                    lines.push(`${indent}${child.text}`);
                } else {
                    const keyStr = JSON.stringify(child.key);
                    const valStr = this.formatNode(child.value, level + 1, child.key);
                    const comma = (i < node.children.length && i !== lastValueIdx) ? "," : "";
                    lines.push(`${indent}${keyStr}: ${valStr}${comma}`);
                }
            }
            lines.push(`${this.indentStr.repeat(level)}}`);
            return lines.join("\n");
        }

        return "";
    }
}