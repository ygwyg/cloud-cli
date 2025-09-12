# Contributing to Cloud CLI

Thank you for your interest in contributing to Cloud CLI! We welcome contributions from the community.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/ygwyg/cloud-cli.git
   cd cloud-cli
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Link the CLI locally** for testing:
   ```bash
   npm link
   ```

## Development Setup

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn
- Git

### Local Development

1. Make your changes to the source code
2. Test your changes locally:
   ```bash
   cloud --help
   cloud nginx:alpine --plan
   ```
3. Run the CLI with verbose logging for debugging:
   ```bash
   cloud nginx:alpine --verbose --plan
   ```

## Code Structure

- `index.js` - Main CLI entry point and command definitions
- `lib/detectors.js` - Container detection and scaffolding logic
- `lib/utils.js` - Utility functions for context loading and UI
- `package.json` - Package configuration and dependencies
- `install.sh` - Installation script

## Making Changes

### Types of Contributions

We welcome:
- Bug fixes
- New features
- Documentation improvements
- Tests
- Code improvements and refactoring

### Before You Start

1. **Check existing issues** to see if your contribution is already being worked on
2. **Open an issue** for discussion if you're planning a major change
3. **Keep changes focused** - one feature or fix per PR

### Coding Guidelines

- Use consistent indentation (2 spaces)
- Follow existing code style and patterns
- Add comments for complex logic
- Use descriptive variable and function names
- Keep functions small and focused

### Container Detection

When adding new container detection methods:

1. Add detection logic to `ContainerDetector.detect()`
2. Update confidence scoring appropriately
3. Add helpful indicator messages
4. Test with various container configurations

### CLI Commands

When adding new CLI options:

1. Add the option to the Commander.js configuration
2. Update the help text in both places (main help and `help` command)
3. Handle the option in the action handler
4. Update documentation

## Testing

### Manual Testing

Test your changes with various scenarios:

```bash
# Test remote images
cloud nginx:alpine --plan
cloud redis:latest --detect

# Test local containers
cd /path/to/dockerfile/project
cloud --plan

# Test edge cases
cloud nonexistent:image --detect
cloud --type container --plan
```

### Test Cases to Cover

- Remote container images (various formats)
- Local Dockerfiles with different configurations
- Projects with docker-compose.yml
- Projects with existing wrangler.jsonc
- Error handling for invalid inputs
- CI/CD scenarios with `--no-prompt`

## Documentation

When making changes:

1. Update README.md if adding new features
2. Update help text in the CLI
3. Add examples for new functionality
4. Update CONTRIBUTING.md if changing development process

## Submitting Changes

### Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit them:
   ```bash
   git add .
   git commit -m "Add: description of your changes"
   ```

3. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Open a Pull Request** on GitHub

### PR Guidelines

- **Write a clear title** describing the change
- **Provide a detailed description** of what you changed and why
- **Reference any related issues** using `#issue-number`
- **Include examples** of how to test the changes
- **Keep PRs focused** - avoid mixing unrelated changes

### Commit Message Format

Use clear, descriptive commit messages:

```
Add: new feature or capability
Fix: bug fix
Update: changes to existing functionality
Remove: removed feature or code
Docs: documentation changes
```

## Code Review Process

1. Maintainers will review your PR
2. You may be asked to make changes
3. Once approved, your PR will be merged
4. Your contribution will be included in the next release

## Getting Help

- Open a [Discussion](https://github.com/ygwyg/cloud-cli/discussions) for questions
- Open an [Issue](https://github.com/ygwyg/cloud-cli/issues) for bugs
- Contact maintainers for sensitive issues

## Recognition

Contributors will be:
- Listed in the project's contributors
- Credited in release notes for significant contributions
- Invited to join the maintainer team for sustained contributions

## License

By contributing to Cloud CLI, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing!
