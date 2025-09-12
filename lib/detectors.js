const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { parse: parseJsonc, modify: modifyJsonc, applyEdits } = require('jsonc-parser');

const log = {
  info: (msg) => console.log(chalk.blue('[info]'), msg),
  success: (msg) => console.log(chalk.green('[ok]'), msg),
  error: (msg) => console.log(chalk.red('[error]'), msg),
  warn: (msg) => console.log(chalk.yellow('[warn]'), msg),
};

class Detector {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  async detect(ctx, opts) {
    throw new Error('detect() must be implemented');
  }

  async scaffold(ctx, opts, detection) {
    throw new Error('scaffold() must be implemented');
  }

  async deploy(ctx, opts, scaffoldResult) {
    throw new Error('deploy() must be implemented');
  }
}

class ContainerDetector extends Detector {
  constructor() {
    super('container', 'Container');
  }

  async detect(ctx, opts) {
    const indicators = [];
    let confidence = 0;
    let image = null;
    let dockerfilePath = null;

    if (ctx.args.length > 0) {
      const arg = ctx.args[0];
      if ((arg.includes(':') || arg.includes('/')) && !path.extname(arg)) {
        image = arg;
        indicators.push(`Explicit image reference: ${arg}`);
        confidence = 0.95;
      }
    }

    const dockerfiles = ['Dockerfile', 'Containerfile', 'dockerfile'];
    for (const df of dockerfiles) {
      const dfPath = path.join(ctx.cwd, df);
      if (await fs.pathExists(dfPath)) {
        indicators.push(`Found ${df}`);
        confidence = Math.max(confidence, 0.9);
        dockerfilePath = dfPath;
        break;
      }
    }

    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const cf of composeFiles) {
      if (await fs.pathExists(path.join(ctx.cwd, cf))) {
        indicators.push(`Found ${cf}`);
        confidence = Math.max(confidence, 0.7);
        break;
      }
    }

    if (await fs.pathExists(path.join(ctx.cwd, '.docker'))) {
      indicators.push('Found .docker directory');
      confidence = Math.max(confidence, 0.6);
    }

    const envFile = path.join(ctx.cwd, '.env');
    if (await fs.pathExists(envFile)) {
      const envContent = await fs.readFile(envFile, 'utf8');
      const imageMatch = envContent.match(/^IMAGE\s*=\s*(.+)$/m);
      if (imageMatch) {
        image = imageMatch[1].replace(/['"]/g, '');
        indicators.push(`Found IMAGE in .env: ${image}`);
        confidence = Math.max(confidence, 0.8);
      }
    }

    if (await fs.pathExists(path.join(ctx.cwd, 'manifest.json'))) {
      indicators.push('Found OCI manifest.json');
      confidence = Math.max(confidence, 0.85);
    }

    if (confidence === 0) return null;

    return {
      detector: this,
      confidence,
      indicators,
      metadata: { image, dockerfilePath }
    };
  }

  async scaffold(ctx, opts, detection) {
    const { image, dockerfilePath } = detection.metadata;
    
    let projectName = opts.name;
    if (!projectName) {
      if (image) {
        projectName = image.split('/').pop().split(':')[0].replace(/[^a-zA-Z0-9-]/g, '-');
      } else {
        projectName = path.basename(ctx.cwd);
      }
    }

    const existingContainer = await this.findExistingContainer(ctx.cwd, image, dockerfilePath);
    
    let className = opts.class;
    if (existingContainer) {
      className = existingContainer.class_name;
      log.info(`Found existing container for this image: ${className}`);
    } else if (!className) {
      const baseName = `${projectName.charAt(0).toUpperCase()}${projectName.slice(1).replace(/-/g, '')}Container`;
      className = await this.generateUniqueClassName(ctx.cwd, baseName);
    }
    
    const bindingName = `${className.toUpperCase().replace('CONTAINER', '')}_CONTAINER`;
    const maxInstances = parseInt(opts.maxInstances || '10');

    const existingWorker = await fs.pathExists(path.join(ctx.cwd, 'src', 'index.ts'));
    const existingWrangler = await fs.pathExists(path.join(ctx.cwd, 'wrangler.jsonc'));
    
    if ((existingWorker || existingWrangler) && !opts.force && !opts.noPrompt) {
      const inquirer = require('inquirer');
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'This will modify existing project files. Continue?',
        default: false
      }]);
      
      if (!proceed) {
        log.info('Operation cancelled');
        return null;
      }
    }

    log.info(`Project: ${projectName}`);
    log.info(`Class: ${className}`);
    log.info(`Binding: ${bindingName}`);

    let finalDockerfilePath = dockerfilePath;
    let containerInfo = { port: 8080 };

    if (image && !dockerfilePath) {
      const generatedPath = path.join(ctx.cwd, 'Dockerfile.generated');
      const generatedDockerfile = `FROM ${image}
EXPOSE 8080`;
      await fs.writeFile(generatedPath, generatedDockerfile);
      log.success('Generated Dockerfile for remote image');
      finalDockerfilePath = './Dockerfile.generated';
    } else if (dockerfilePath) {
      containerInfo = await this.analyzeDockerfile(dockerfilePath);
      finalDockerfilePath = path.relative(ctx.cwd, dockerfilePath);
      if (!finalDockerfilePath.startsWith('.')) {
        finalDockerfilePath = `./${finalDockerfilePath}`;
      }
      log.info(`Detected port: ${containerInfo.port}`);
    }

    const srcDir = path.join(ctx.cwd, 'src');
    await fs.ensureDir(srcDir);

    log.info('Generating project files...');

    const workerPath = path.join(srcDir, 'index.ts');
    if (await fs.pathExists(workerPath)) {
      await this.updateWorkerCode(workerPath, className, bindingName, containerInfo.port);
      log.success('Updated src/index.ts with container class');
    } else {
      const workerCode = this.generateWorkerCode(className, bindingName, containerInfo.port);
      await fs.writeFile(workerPath, workerCode);
      log.success('Generated src/index.ts');
    }

    const wranglerPath = path.join(ctx.cwd, 'wrangler.jsonc');
    if (await fs.pathExists(wranglerPath)) {
      await this.mergeWranglerConfig(wranglerPath, className, bindingName, finalDockerfilePath, maxInstances);
      log.success('Updated wrangler.jsonc with container configuration');
    } else {
      const wranglerConfig = this.generateWranglerConfig(projectName, className, bindingName, finalDockerfilePath, maxInstances);
      await fs.writeFile(wranglerPath, JSON.stringify(wranglerConfig, null, 2));
      log.success('Generated wrangler.jsonc');
    }

    const tsConfigPath = path.join(ctx.cwd, 'tsconfig.json');
    if (!await fs.pathExists(tsConfigPath)) {
      const tsConfig = this.generateTsConfig();
      await fs.writeFile(tsConfigPath, JSON.stringify(tsConfig, null, 2));
      log.success('Generated tsconfig.json');
    }

    const packageJsonPath = path.join(ctx.cwd, 'package.json');
    if (!await fs.pathExists(packageJsonPath)) {
      const packageJson = this.generatePackageJson(projectName);
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      log.success('Generated package.json');
    } else {
      await this.mergePackageJsonDependencies(packageJsonPath, projectName);
      log.success('Updated package.json with required dependencies');
    }

    const cfignorePath = path.join(ctx.cwd, '.cfignore');
    if (!await fs.pathExists(cfignorePath)) {
      const cfignore = `node_modules/
*.log
.env
.DS_Store
dist/
build/
coverage/
.nyc_output/
*.tgz
*.tar.gz`;
      await fs.writeFile(cfignorePath, cfignore);
      log.success('Generated .cfignore');
    }

    return { projectName, className, bindingName };
  }

  async findExistingContainer(cwd, image, dockerfilePath) {
    const wranglerPath = path.join(cwd, 'wrangler.jsonc');
    if (!await fs.pathExists(wranglerPath)) {
      return null;
    }
    
    try {
      const wranglerContent = await fs.readFile(wranglerPath, 'utf8');
      const wranglerConfig = parseJsonc(wranglerContent);
      
      if (!wranglerConfig.containers) {
        return null;
      }
      
      // Look for existing container with same image
      const targetImage = image ? `./Dockerfile.generated` : (dockerfilePath ? path.relative(cwd, dockerfilePath) : './Dockerfile');
      
      return wranglerConfig.containers.find(container => 
        container.image === targetImage || 
        container.image === `./Dockerfile` ||
        (image && container.image === './Dockerfile.generated')
      );
    } catch (error) {
      return null;
    }
  }

  async generateUniqueClassName(cwd, baseName) {
    // Check both worker file and wrangler config to avoid conflicts
    const workerPath = path.join(cwd, 'src', 'index.ts');
    const wranglerPath = path.join(cwd, 'wrangler.jsonc');
    
    let existingClasses = new Set();
    
    // Check worker file for existing classes
    if (await fs.pathExists(workerPath)) {
      try {
        const existingCode = await fs.readFile(workerPath, 'utf8');
        const classMatches = existingCode.match(/export class (\w+)/g);
        if (classMatches) {
          classMatches.forEach(match => {
            const className = match.replace('export class ', '');
            existingClasses.add(className);
          });
        }
      } catch (error) {
      }
    }
    
    // Check wrangler config for existing container classes
    if (await fs.pathExists(wranglerPath)) {
      try {
        const wranglerContent = await fs.readFile(wranglerPath, 'utf8');
        const wranglerConfig = parseJsonc(wranglerContent);
        if (wranglerConfig.containers) {
          wranglerConfig.containers.forEach(container => {
            existingClasses.add(container.class_name);
          });
        }
      } catch (error) {
      }
    }
    
    // Find a unique name
    let className = baseName;
    let counter = 1;
    
    while (existingClasses.has(className)) {
      className = `${baseName}${counter}`;
      counter++;
    }
    
    return className;
  }

  async mergePackageJsonDependencies(packageJsonPath, projectName) {
    try {
      const existingPackageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const requiredDeps = this.generatePackageJson(projectName);
      
      // Merge dependencies
      existingPackageJson.dependencies = {
        ...existingPackageJson.dependencies,
        ...requiredDeps.dependencies
      };
      
      // Merge devDependencies
      existingPackageJson.devDependencies = {
        ...existingPackageJson.devDependencies,
        ...requiredDeps.devDependencies
      };
      
      // Add scripts if they don't exist
      existingPackageJson.scripts = {
        ...existingPackageJson.scripts,
        ...requiredDeps.scripts
      };
      
      await fs.writeFile(packageJsonPath, JSON.stringify(existingPackageJson, null, 2));
    } catch (error) {
      log.warn(`Failed to merge package.json: ${error.message}`);
    }
  }

  async updateWorkerCode(workerPath, className, bindingName, port = 8080) {
    try {
      const existingCode = await fs.readFile(workerPath, 'utf8');
      
      // Check if the class already exists
      if (existingCode.includes(`export class ${className}`)) {
        log.info(`Container class ${className} already exists in worker`);
        return;
      }
      
      // Add the new container class at the top (after imports)
      const lines = existingCode.split('\n');
      let insertIndex = 0;
      
      // Find the end of imports
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') || line.startsWith('//') || line === '') {
          insertIndex = i + 1;
        } else {
          break;
        }
      }
      
      const containerClass = `
export class ${className} extends Container<Env> {
  defaultPort = ${port};
  sleepAfter = "2m";
  
  override onStart() {
    console.log("${className} successfully started on port ${port}");
  }

  override onStop() {
    console.log("${className} successfully shut down");
  }

  override onError(error: unknown) {
    console.log("${className} error:", error);
  }
}
`;
      
      lines.splice(insertIndex, 0, containerClass);
      await fs.writeFile(workerPath, lines.join('\n'));
      
      log.info(`Added ${className} to existing worker`);
    } catch (error) {
      log.warn(`Failed to update worker code: ${error.message}`);
      // Fall back to generating new worker code
      const workerCode = this.generateWorkerCode(className, bindingName, port);
      await fs.writeFile(workerPath, workerCode);
    }
  }

  async getSmartMigrationTag(cwd, workerName) {
    const hasExistingWorker = await fs.pathExists(path.join(cwd, 'src', 'index.ts'));
    const hasExistingPackage = await fs.pathExists(path.join(cwd, 'package.json'));
    const hasNodeModules = await fs.pathExists(path.join(cwd, 'node_modules'));
    
    if ((hasExistingWorker && hasExistingPackage) || hasNodeModules) {
      log.info('Detected existing project - using migration tag v10');
      return "v10";
    }
    
    return "v1";
  }

  async mergeWranglerConfig(wranglerPath, className, bindingName, dockerfilePath, maxInstances) {
    try {
      const wranglerContent = await fs.readFile(wranglerPath, 'utf8');
      const existingConfig = parseJsonc(wranglerContent);
      
      // Add container configuration
      if (!existingConfig.containers) {
        existingConfig.containers = [];
      }
      
      const existingContainerIndex = existingConfig.containers.findIndex(c => 
        c.image === dockerfilePath || c.class_name === className
      );
      
      const newContainer = {
        class_name: className,
        image: dockerfilePath,
        max_instances: maxInstances,
        instance_type: "basic"
      };
      
      if (existingContainerIndex >= 0) {
        existingConfig.containers[existingContainerIndex] = newContainer;
        log.info(`Updated existing container configuration for ${className}`);
      } else {
        existingConfig.containers.push(newContainer);
        log.info(`Added new container configuration for ${className}`);
      }
      
      if (!existingConfig.durable_objects) {
        existingConfig.durable_objects = { bindings: [] };
      }
      if (!existingConfig.durable_objects.bindings) {
        existingConfig.durable_objects.bindings = [];
      }
      
      const existingBindingIndex = existingConfig.durable_objects.bindings.findIndex(b => b.class_name === className);
      const newBinding = {
        class_name: className,
        name: bindingName
      };
      
      if (existingBindingIndex >= 0) {
        existingConfig.durable_objects.bindings[existingBindingIndex] = newBinding;
      } else {
        existingConfig.durable_objects.bindings.push(newBinding);
      }
      
      if (!existingConfig.migrations) {
        existingConfig.migrations = [];
      }
      
      const classExistsInMigrations = existingConfig.migrations.some(migration => 
        migration.new_sqlite_classes?.includes(className)
      );
      
      if (!classExistsInMigrations) {
        let latestMigration = existingConfig.migrations[existingConfig.migrations.length - 1];
        
        if (!latestMigration) {
          const migrationTag = opts.migrationTag || await this.getSmartMigrationTag(ctx.cwd, existingConfig.name);
          latestMigration = {
            new_sqlite_classes: [className],
            tag: migrationTag
          };
          existingConfig.migrations.push(latestMigration);
          if (opts.migrationTag) {
            log.info(`Using manual migration tag ${migrationTag} for ${className}`);
          } else {
            log.info(`Created new migration ${migrationTag} for ${className}`);
          }
        } else {
          if (!latestMigration.new_sqlite_classes) {
            latestMigration.new_sqlite_classes = [];
          }
          
          if (latestMigration.new_sqlite_classes.length >= 3) {
            const newTagNumber = existingConfig.migrations.length + 1;
            const newMigration = {
              new_sqlite_classes: [className],
              tag: `v${newTagNumber}`
            };
            existingConfig.migrations.push(newMigration);
            log.info(`Created new migration v${newTagNumber} for ${className}`);
          } else {
            latestMigration.new_sqlite_classes.push(className);
            log.info(`Added ${className} to existing migration ${latestMigration.tag}`);
          }
        }
      } else {
        log.info(`Class ${className} already exists in migrations, skipping`);
      }
      
      if (!existingConfig.compatibility_flags) {
        existingConfig.compatibility_flags = [];
      }
      if (!existingConfig.compatibility_flags.includes("nodejs_compat")) {
        existingConfig.compatibility_flags.push("nodejs_compat");
      }
      
      await fs.writeFile(wranglerPath, JSON.stringify(existingConfig, null, 2));
    } catch (error) {
      log.error(`Failed to merge wrangler config: ${error.message}`);
      throw error;
    }
  }

  async deploy(ctx, opts, scaffoldResult) {
    log.info('Installing dependencies...');
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
      const npmInstall = spawn('npm', ['install'], { cwd: ctx.cwd, stdio: 'inherit' });
      
      npmInstall.on('close', (code) => {
        if (code !== 0) {
          log.error('Failed to install dependencies');
          resolve(false);
          return;
        }
        
        log.success('Dependencies installed successfully');
        
        // Generate types
        log.info('Generating TypeScript types...');
        const wranglerTypes = spawn('npx', ['wrangler', 'types'], { cwd: ctx.cwd, stdio: 'inherit' });
        
        wranglerTypes.on('close', (typesCode) => {
          if (typesCode === 0) {
            log.success('TypeScript types generated');
          }
          
          // Deploy
          log.info('Deploying to Cloudflare...');
          const wranglerDeploy = spawn('npx', ['wrangler', 'deploy'], { cwd: ctx.cwd, stdio: 'inherit' });
          
          wranglerDeploy.on('close', (deployCode) => {
            if (deployCode === 0) {
              log.success('Deployment completed successfully!');
              resolve(true);
            } else {
              log.error('Deployment failed');
              resolve(false);
            }
          });
        });
      });
    });
  }

  async analyzeDockerfile(dockerfilePath) {
    try {
      const content = await fs.readFile(dockerfilePath, 'utf8');
      const lines = content.split('\n');
      
      let port = 8080; // default
      
      // Look for EXPOSE directive
      for (const line of lines) {
        const exposeLine = line.trim().toUpperCase();
        if (exposeLine.startsWith('EXPOSE ')) {
          const exposedPort = parseInt(exposeLine.split(' ')[1]);
          if (!isNaN(exposedPort)) {
            port = exposedPort;
            break;
          }
        }
      }
      
      return { port };
    } catch (error) {
      log.warn(`Could not analyze Dockerfile: ${error.message}`);
      return { port: 8080 };
    }
  }

  generateWorkerCode(className, bindingName, port = 8080) {
    return `import { Container, getContainer } from "@cloudflare/containers";
import { Hono } from "hono";

export class ${className} extends Container<Env> {
  defaultPort = ${port};
  sleepAfter = "2m";
  
  override onStart() {
    console.log("${className} successfully started on port ${port}");
  }

  override onStop() {
    console.log("${className} successfully shut down");
  }

  override onError(error: unknown) {
    console.log("${className} error:", error);
  }
}

const app = new Hono<{
  Bindings: Env;
}>();

// Forward all requests to container - no health check needed
app.all("*", async (c) => {
  const container = getContainer(c.env.${bindingName});
  return await container.fetch(c.req.raw);
});

export default app;`;
  }

  generateWranglerConfig(projectName, className, bindingName, dockerfilePath, maxInstances) {
    return {
      name: projectName,
      main: "src/index.ts",
      compatibility_date: new Date().toISOString().split('T')[0],
      compatibility_flags: ["nodejs_compat"],
      observability: {
        enabled: true
      },
      containers: [
        {
          class_name: className,
          image: dockerfilePath,
          max_instances: maxInstances,
          instance_type: "basic"
        }
      ],
      durable_objects: {
        bindings: [
          {
            class_name: className,
            name: bindingName
          }
        ]
      },
      migrations: [
        {
          new_sqlite_classes: [className],
          tag: "v1"
        }
      ]
    };
  }

  generateTsConfig() {
    return {
      compilerOptions: {
        target: "es2021",
        lib: ["es2021"],
        module: "es2022",
        moduleResolution: "Bundler",
        types: ["./worker-configuration.d.ts", "node"],
        resolveJsonModule: true,
        allowJs: true,
        checkJs: false,
        noEmit: true,
        isolatedModules: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true
      },
      exclude: ["test"],
      include: ["worker-configuration.d.ts", "src/**/*.ts"]
    };
  }

  generatePackageJson(projectName) {
    return {
      name: projectName,
      description: `Cloudflare Worker with Container - ${projectName}`,
      private: true,
      scripts: {
        deploy: "wrangler deploy",
        dev: "wrangler dev",
        start: "wrangler dev",
        "cf-typegen": "wrangler types"
      },
      devDependencies: {
        "@types/node": "^24.3.0",
        "typescript": "5.8.3",
        "wrangler": "^4.33.1"
      },
      dependencies: {
        "@cloudflare/containers": "^0.0.19",
        "hono": "4.8.2"
      }
    };
  }
}


module.exports = {
  Detector,
  ContainerDetector
};
