# Cloud CLI

Deploy containers to Cloudflare with one command.

**WARNING: This is early beta software (v0.0.1). Not recommended for production use.**

## What it does

Cloud CLI detects your container setup and generates the necessary Cloudflare Worker configuration to deploy your container to Cloudflare's platform.

## Features

- Deploy local Dockerfiles or remote container images
- Auto-detects container projects
- Generates Cloudflare Worker configs
- Supports Dockerfiles, docker-compose, and remote images
- Non-interactive mode for CI/CD

## Installation

```bash
npm install -g cloud-cli
```

Or clone and install locally:

```bash
git clone https://github.com/ygwyg/cloud-cli.git
cd cloud-cli
npm install
npm link
```

## Usage

### Basic commands

```bash
# Auto-detect and prepare project
cloud

# Auto-detect, prepare, and deploy
cloud --ship

# Show what would happen (dry run)
cloud --plan

# Show detected project type
cloud --detect
```

### Examples

```bash
# Deploy remote images
cloud nginx:alpine --ship
cloud redis:latest --name my-cache --ship

# Deploy local containers
cloud ./Dockerfile --ship
cloud --type container --ship

# Custom configuration
cloud nginx:alpine --name web-server --max-instances 5 --ship
```

### Options

- `--ship` - Deploy to cloud after preparation
- `--plan` - Show execution plan (dry run)
- `--detect` - Show detection results only
- `--type <type>` - Force project type (container)
- `--name <name>` - Override project name
- `--class <class>` - Container class name override
- `--max-instances <number>` - Maximum container instances (default: 10)
- `--migration-tag <tag>` - Override migration tag
- `--no-prompt` - Non-interactive mode (for CI/CD)
- `--force` - Overwrite existing files
- `--verbose` - Detailed logging

## How it works

1. Scans for container indicators (Dockerfile, docker-compose.yml, image references)
2. Analyzes container configuration (ports, environment, etc.)
3. Creates Cloudflare Worker proxy and configuration files
4. Builds and deploys to Cloudflare's platform

### Generated files

- `src/index.ts` - Cloudflare Worker that proxies requests to your container
- `wrangler.jsonc` - Cloudflare configuration with container settings
- `package.json` - Dependencies and deployment scripts (if missing)
- `tsconfig.json` - TypeScript configuration (if missing)
- `.cfignore` - Files to ignore during deployment
- `Dockerfile.generated` - For remote images

## Container detection

The CLI detects containers based on:

- Dockerfile or Containerfile in the current directory
- docker-compose.yml files
- Remote image references (e.g., `nginx:alpine`)
- IMAGE environment variable in .env files
- OCI manifest.json files

## Requirements

- Node.js 16.0.0 or higher
- npm or yarn
- Cloudflare account (for deployment)

## Configuration

Create a `cf.config.json` file in your project root:

```json
{
  "name": "my-container-app",
  "maxInstances": 5,
  "migrationTag": "v2"
}
```

Set `IMAGE=your-image:tag` in `.env` to specify a container image.

## Troubleshooting

### Common issues

1. **No project detected**: Make sure you have a Dockerfile or specify an image
2. **Deployment fails**: Check your Cloudflare credentials and permissions
3. **Port conflicts**: The CLI auto-detects ports from Dockerfile EXPOSE directives

### Debug mode

Use `--verbose` for detailed logging:

```bash
cloud nginx:alpine --verbose --ship
```

## Beta limitations

This software is in early development. Known limitations:

- Limited error handling
- Basic container detection
- Minimal testing
- API may change

Use at your own risk. Report issues on GitHub.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Report issues: https://github.com/ygwyg/cloud-cli/issues
- Discussions: https://github.com/ygwyg/cloud-cli/discussions

Deploy any container to Cloudflare with one command.