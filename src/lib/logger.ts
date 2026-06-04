type LogContext = Record<string, unknown> | undefined;

const LOG_PREFIX = '[PhotoShow]';

function getTimestamp() {
	return new Date().toISOString();
}

function write(
	level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
	message: string,
	context?: LogContext
) {
	const method = (console[level] ?? console.log).bind(console);
	if (context !== undefined) {
		method(`${LOG_PREFIX} ${getTimestamp()} ${message}`, context);
		return;
	}
	method(`${LOG_PREFIX} ${getTimestamp()} ${message}`);
}

export const appLog = {
	trace(message: string, context?: LogContext) {
		write('trace', message, context);
	},
	debug(message: string, context?: LogContext) {
		write('debug', message, context);
	},
	info(message: string, context?: LogContext) {
		write('info', message, context);
	},
	warn(message: string, context?: LogContext) {
		write('warn', message, context);
	},
	error(message: string, context?: LogContext) {
		write('error', message, context);
	}
};
