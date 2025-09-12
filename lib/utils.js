const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');

const EXIT_CODES = {
  SUCCESS: 0,
  PARTIAL: 2,
  USAGE: 64,
  CONFIG: 65
};

async function loadContext(args) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  
  return {
    cwd,
    args: args || [],
    config
  };
}

async function loadConfig(cwd) {
  const configFiles = ['cf.config.json', 'cf.config.js', '.cfrc.json'];
  
  for (const configFile of configFiles) {
    const configPath = path.join(cwd, configFile);
    if (await fs.pathExists(configPath)) {
      try {
        if (configFile.endsWith('.json')) {
          return JSON.parse(await fs.readFile(configPath, 'utf8'));
        } else if (configFile.endsWith('.js')) {
          delete require.cache[require.resolve(configPath)];
          return require(configPath);
        }
      } catch (error) {
        console.log(chalk.yellow('⚠'), `Failed to load config from ${configFile}: ${error.message}`);
      }
    }
  }
  
  return {};
}

async function autoDetect(detectors, ctx, opts) {
  const results = [];
  
  for (const detector of detectors) {
    const result = await detector.detect(ctx, opts);
    if (result) {
      results.push(result);
    }
  }
  
  if (results.length === 0) return null;
  
  results.sort((a, b) => b.confidence - a.confidence);
  
  if (results.length > 1 && results[0].confidence - results[1].confidence < 0.1) {
    if (opts.noPrompt) {
      return results[0];
    }
    
    const choices = results.map(r => ({
      name: `${r.detector.name} (confidence: ${Math.round(r.confidence * 100)}%)`,
      value: r
    }));
    
    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: 'Multiple project types detected. Which would you like to use?',
      choices
    }]);
    
    return selected;
  }
  
  return results[0];
}

function printDetection(result) {
  if (!result) {
    console.log(chalk.red('No project type detected'));
    return;
  }
  
  console.log(chalk.blue.bold(`\nDetected: ${result.detector.name}`));
  console.log(chalk.green(`Confidence: ${Math.round(result.confidence * 100)}%`));
  console.log(chalk.yellow('\nIndicators:'));
  result.indicators.forEach(indicator => {
    console.log(chalk.gray(`  - ${indicator}`));
  });
  
  if (Object.keys(result.metadata).length > 0) {
    console.log(chalk.yellow('\nMetadata:'));
    Object.entries(result.metadata).forEach(([key, value]) => {
      if (value) console.log(chalk.gray(`  ${key}: ${value}`));
    });
  }
}

function printPlan(result, ctx, opts) {
  console.log(chalk.blue.bold('\n📋 Execution Plan\n'));
  
  console.log(chalk.yellow('Detected project type:'));
  console.log(`  ${result.detector.name} (${Math.round(result.confidence * 100)}% confidence)`);
  
  console.log(chalk.yellow('\nFiles that would be created/modified:'));
  
  if (result.detector.id === 'container') {
    console.log(chalk.gray('  - src/index.ts (Worker proxy code)'));
    console.log(chalk.gray('  - wrangler.jsonc (Cloudflare configuration)'));
    console.log(chalk.gray('  - tsconfig.json (if missing)'));
    console.log(chalk.gray('  - package.json (if missing)'));
    console.log(chalk.gray('  - .cfignore'));
    if (result.metadata.image && !result.metadata.dockerfilePath) {
      console.log(chalk.gray('  - Dockerfile.generated (for remote image)'));
    }
  }
  
  console.log(chalk.yellow('\nCommands that would run:'));
  if (opts.ship) {
    console.log(chalk.gray('  - npm install'));
    if (result.detector.id === 'container') {
      console.log(chalk.gray('  - npx wrangler types'));
      console.log(chalk.gray('  - npx wrangler deploy'));
    }
  } else {
    console.log(chalk.gray('  - (none - scaffold only)'));
  }
  
  console.log(chalk.green('\nTo execute this plan, run the same command without --plan'));
}

module.exports = {
  EXIT_CODES,
  loadContext,
  loadConfig,
  autoDetect,
  printDetection,
  printPlan
};
