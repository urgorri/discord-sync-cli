import chalk from 'chalk';

export const logger = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  success: (msg) => console.log(chalk.green('✔'), chalk.green(msg)),
  warn: (msg) => console.warn(chalk.yellow('⚠'), chalk.yellow(msg)),
  error: (msg) => console.error(chalk.red('✖'), chalk.red(msg)),
};

export default logger;
