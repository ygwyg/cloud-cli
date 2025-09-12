#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { ContainerDetector } = require('./lib/detectors');
const { EXIT_CODES, loadContext, autoDetect, printDetection, printPlan } = require('./lib/utils');

const program = new Command();

const log = {
  info: (msg) => console.log(chalk.blue('[info]'), msg),
  success: (msg) => console.log(chalk.green('[ok]'), msg),
  error: (msg) => console.log(chalk.red('[error]'), msg),
  warn: (msg) => console.log(chalk.yellow('[warn]'), msg),
};

// Main dispatcher
async function main() {
  program
    .name('cloud')
    .description('Ship any container to the cloud with a single command')
    .version('0.0.1')
    .argument('[target]', 'Target to ship (image, directory, etc.)')
    .option('--ship', 'Ship to cloud after preparation')
    .option('--plan', 'Show what would happen (dry run)')
    .option('--detect', 'Show detected project type and exit')
    .option('--type <type>', 'Force specific project type (container)')
    .option('--name <name>', 'Project name override')
    .option('--class <class>', 'Container class name override')
    .option('--max-instances <number>', 'Maximum container instances', '10')
    .option('--migration-tag <tag>', 'Override migration tag (e.g. v4)')
    .option('--no-prompt', 'Non-interactive mode for CI')
    .option('--force', 'Overwrite existing files')
    .option('--verbose', 'Verbose logging')
    .action(async (target, opts) => {
      try {
        const ctx = await loadContext(target ? [target] : []);
        const detectors = [new ContainerDetector()];
        
        // Apply config overrides
        Object.assign(opts, ctx.config);
        
        // Force specific detector if requested
        const forcedDetector = opts.type ? detectors.find(d => d.id === opts.type) : null;
        
        let result;
        if (forcedDetector) {
          result = await forcedDetector.detect(ctx, opts);
          if (!result) {
            log.error(`No ${opts.type} project detected`);
            process.exit(EXIT_CODES.CONFIG);
          }
        } else {
          result = await autoDetect(detectors, ctx, opts);
          if (!result) {
            console.log(chalk.red('\nNo supported project type detected\n'));
            console.log(chalk.yellow('Supported types:'));
            console.log(chalk.gray('  - Container (Dockerfile, docker-compose.yml, image reference)'));
            console.log(chalk.yellow('\nTry:'));
            console.log(chalk.gray('  - cloud --type container <image>'));
            console.log(chalk.gray('  - cloud --detect (to see what was found)'));
            process.exit(EXIT_CODES.USAGE);
          }
        }
        
        // Handle detection-only mode
        if (opts.detect) {
          printDetection(result);
          return;
        }
        
        // Handle plan mode
        if (opts.plan) {
          printPlan(result, ctx, opts);
          return;
        }
        
        // Execute scaffold
        log.info(`Preparing ${result.detector.name} project...`);
        const scaffoldResult = await result.detector.scaffold(ctx, opts, result);
        
        if (!scaffoldResult) {
          log.error('Scaffolding failed');
          process.exit(EXIT_CODES.CONFIG);
        }
        
        log.success('Project preparation completed!');
        
        // Execute ship if requested
        if (opts.ship) {
          const shipSuccess = await result.detector.deploy(ctx, opts, scaffoldResult);
          if (!shipSuccess) {
            log.warn('Shipping failed, but scaffolding was successful');
            process.exit(EXIT_CODES.PARTIAL);
          }
        } else {
          console.log(chalk.blue('\nNext steps:'));
          console.log(chalk.gray('  - Review generated files'));
          console.log(chalk.gray('  - Run: cloud --ship (to deploy to cloud)'));
          console.log(chalk.gray('  - Or run: npm run deploy'));
        }
        
      } catch (error) {
        log.error(`Error: ${error.message}`);
        if (opts.verbose) {
          console.error(error.stack);
        }
        process.exit(EXIT_CODES.CONFIG);
      }
    });

  // Help command
  program
    .command('help')
    .description('Show detailed help and examples')
    .action(() => {
    console.log(chalk.blue.bold('\nCloud CLI - Deploy Any Container to Cloudflare\n'));
    
    console.log(chalk.yellow('Basic Usage:'));
    console.log('  cloud                            Auto-detect and prepare project');
    console.log('  cloud --ship                     Auto-detect, prepare, and deploy to cloud');
    console.log('  cloud --plan                     Show what would happen (dry run)');
    console.log('  cloud --detect                   Show detected project type');
    
    console.log(chalk.yellow('\nContainer Examples:'));
    console.log('  cloud nginx:alpine               Deploy remote image');
    console.log('  cloud ./Dockerfile --ship        Deploy local container');
    console.log('  cloud --type container --ship    Force container detection');
    console.log('  cloud redis:alpine --name my-cache --ship');
    
    console.log(chalk.yellow('\nOptions:'));
    console.log('  --ship                           Deploy to cloud after preparation');
    console.log('  --plan                           Dry run (show plan)');
    console.log('  --detect                         Show detection results');
    console.log('  --type <type>                    Force project type (container)');
    console.log('  --name <name>                    Override project name');
    console.log('  --class <class>                  Container class name override');
    console.log('  --max-instances <number>         Maximum container instances (default: 10)');
    console.log('  --migration-tag <tag>            Override migration tag (e.g. v4)');
    console.log('  --no-prompt                      Non-interactive (CI mode)');
    console.log('  --force                          Overwrite existing files');
    console.log('  --verbose                        Detailed logging');
    
    console.log(chalk.yellow('\nSupported Project Types:'));
    console.log('  Container                        Dockerfile, images, docker-compose');
    
    console.log(chalk.green('\nDeploy any container to Cloudflare with one command!'));
    });

  await program.parseAsync();
}

// Run the CLI
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(EXIT_CODES.CONFIG);
  });
}

module.exports = { main, loadContext, autoDetect };