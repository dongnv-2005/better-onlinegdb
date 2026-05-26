export interface GdbStoppedResult {
    event: string;
    reason?: string;
    line?: number;
    file?: string;
    func?: string;
}

export interface GdbVariable {
    name: string;
    type: string;
    value: string;
}

export class GdbMiParser {
    /**
     * Parse trạng thái dừng (*stopped) của GDB/MI để lấy dòng code hiện tại
     */
    public static parseStopped(rawLine: string): GdbStoppedResult | null {
        if (!rawLine.startsWith('*stopped')) return null;

        const result: GdbStoppedResult = { event: 'stopped' };

        const reasonMatch = rawLine.match(/reason="([^"]+)"/);
        if (reasonMatch) result.reason = reasonMatch[1];

        const fileMatch = rawLine.match(/file="([^"]+)"/);
        if (fileMatch) result.file = fileMatch[1];

        const funcMatch = rawLine.match(/func="([^"]+)"/);
        if (funcMatch) result.func = funcMatch[1];

        const lineMatch = rawLine.match(/line="(\d+)"/);
        if (lineMatch) result.line = parseInt(lineMatch[1], 10);

        return result;
    }

    /**
     * Parse danh sách các biến cục bộ thu được từ lệnh ngầm -stack-list-locals --simple-values
     */
    public static parseLocals(rawOutput: string): GdbVariable[] {
        const variables: GdbVariable[] = [];
        
        const localsSectionMatch = rawOutput.match(/locals=\[([\s\S]*?)\]/);
        if (!localsSectionMatch) return variables;

        const localsContent = localsSectionMatch[1];
        
        // Regex khớp cấu trúc sinh ra bởi cờ --simple-values: {name="...",type="...",value="..."}
        const itemRegex = /\{name="([^"]+)",type="([^"]+)",value="([^"]+)"\}/g;
        let match;

        while ((match = itemRegex.exec(localsContent)) !== null) {
            variables.push({
                name: match[1],
                type: match[2],
                value: match[3]
            });
        }

        return variables;
    }
}