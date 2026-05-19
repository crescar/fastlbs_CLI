export class FastlbsError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'FastlbsError';
        this.code = options.code ?? 'FASTLBS_ERROR';
        this.hint = options.hint;
        this.exitCode = options.exitCode ?? 1;
    }
}

export function asFastlbsError(error) {
    if (error instanceof FastlbsError) {
        return error;
    }

    return new FastlbsError(
        error instanceof Error ? error.message : String(error),
        {
            code: 'UNEXPECTED_ERROR',
            hint: 'Run the command again with valid inputs and project context.',
            exitCode: 1,
        }
    );
}
