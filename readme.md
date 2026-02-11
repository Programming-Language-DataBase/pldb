# PLDB - A Programming Language Database

[![Build and Release](https://github.com/kaby76/pldb/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/kaby76/pldb/actions/workflows/build.yml)

PLDB is a comprehensive public domain database containing over 135,000 facts about more than 5,000 programming languages. The project includes both the complete dataset and the website code for [pldb.io](https://pldb.io).

## 🌟 Key Features

- **Rich Dataset**: Extensive information about programming languages, from high-level formats to binary specifications
- **Multiple Export Formats**: Access the complete dataset in CSV, TSV, or JSON format
- **Public Domain**: All data and code is freely available for any use
- **Regular Updates**: Actively maintained with version control and release notes
- **Web Interface**: Browse the data through an intuitive web interface at [pldb.io](https://pldb.io)

## 📊 Data Downloads

Access the complete dataset in your preferred format:

- **CSV**: [pldb.io/pldb.csv](https://pldb.io/pldb.csv)
- **TSV**: [pldb.io/pldb.tsv](https://pldb.io/pldb.tsv)
- **JSON**: [pldb.io/pldb.json](https://pldb.io/pldb.json)

Full documentation for the data formats is available at [pldb.io/csv.html](https://pldb.io/csv.html)

## 🚀 Local Development

### Quick Start (Build & Serve)

```bash
# Clone the repository
git clone https://github.com/breck7/pldb
cd pldb

# Install dependencies
npm install

# Build everything and start local server
npm run build:serve
```

Then open http://localhost:3000 in your browser.

### Prerequisites

- Node.js (v18 or later recommended)
- npm
- cloc (optional, for line counting): `npm i -g cloc`

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the entire site |
| `npm run build:serve` | Build and start local server |
| `npm run serve` | Start local server (without rebuilding) |
| `npm run test` | Run tests |
| `npm run format` | Format code before committing |

### What the Build Does

The build script (`build.js`) performs these steps in order:

1. **Build parsers** - Compiles the parser definitions
2. **Patch scroll-cli** - Automatically patches scroll-cli for Windows compatibility (if needed)
3. **Build root folder** - Generates `pldb.json`, `measures.json`, and root HTML files
4. **Generate feature pages** - Creates `.scroll` files for each language feature
5. **Build subfolders** - Builds all content folders in the correct order:
   - `blog/`, `books/`, `concepts/`, `creators/`, `features/`, `lists/`, `pages/`

**Build order matters:** `creators/` must be built before `lists/` (lists needs `creators.json`)

### Manual Build Steps

If you need to run build steps manually:

```bash
# 1. Build the parsers file
node cli.js buildParsersFile

# 2. Build the root folder
node ./node_modules/scroll-cli/scroll.js build

# 3. Generate feature pages (requires measures.json from step 2)
node -e "const {Tables} = require('./Computer.js'); Tables.writeAllFeaturePages()"

# 4. Build all subfolders
for dir in blog books concepts creators features lists pages; do
  (cd "$dir" && node ../node_modules/scroll-cli/scroll.js build)
done

# 5. Start server
npx serve .
```

### Troubleshooting

**Windows/MSYS2 users:** The build script automatically patches `scroll-cli` for Windows path compatibility. If you encounter path-related errors, the patch replaces `Utils.posix.dirname/basename` with `require("path").dirname/basename` in `node_modules/scroll-cli/parsers/root.parsers`.

**Empty tables or missing data:** Ensure all subfolders are built. The `npm run build` command builds everything, but if you're building manually, remember that `creators/` must be built before `lists/`.

**Port already in use:** If port 3000 is busy, use `npx serve . -l 8080` to use a different port.

## 📁 Repository Structure

The most important components of the repository:

- `concepts/`: Contains the ScrollSet (individual files for each concept)
- `code/measures.parsers`: Contains the Parsers (schema) for the ScrollSet
- View detailed language statistics at [pldb.io/pages/about.html](https://pldb.io/pages/about.html)

## 🏆 Rankings

PLDB includes a sophisticated ranking system for programming languages based on five key metrics:

- Number of estimated users
- Foundation score (languages built using this language)
- Estimated job opportunities
- Language influence
- Available measurements

Learn more about the ranking algorithm at [pldb.io/pages/the-rankings-algorithm.html](https://pldb.io/pages/the-rankings-algorithm.html)

## 📜 Version History

Latest major releases:

- **9.0.0** (May 2024): Migrated to Scroll 84
- **8.0.0** (March 2023): Upgraded to TrueBase 9
- See [Release Notes](https://pldb.io/releaseNotes.html) for complete history

## 🤝 Contributing

Contributions are welcome! PLDB is designed for two main audiences:

1. **Programming Language Creators**: Use our organized data to make informed design decisions
2. **Programming Language Users**: Get data-driven insights about the programming language ecosystem

## 📚 Resources

- **Main Website**: [pldb.io](https://pldb.io)
- **About Page**: [pldb.io/pages/about.html](https://pldb.io/pages/about.html)
- **Acknowledgements**: [pldb.io/pages/acknowledgements.html](https://pldb.io/pages/acknowledgements.html)

## 📖 Citation

This project is dedicated to the public domain. When using PLDB, we appreciate attribution but it's not required. All sources are listed at [pldb.io/pages/acknowledgements.html](https://pldb.io/pages/acknowledgements.html).

## 🚢 Making Changes and Deploying

### 1. Make your changes locally

Edit the ScrollSet files in `concepts/`, update parsers in `code/measures.parsers`, or modify any other source files.

### 2. Push to main

When you push to the `main` branch, a GitHub Actions workflow automatically:
- Installs dependencies and builds the site
- Packages the built site into `site.tar.gz`
- Publishes it as a GitHub Release tagged `latest`

The build takes about 2 minutes on GitHub's runners.

### 3. Deploy to server

The `setup-pldb.sh` script deploys the pre-built site to a fresh Ubuntu server (tested on Ubuntu 24.04). It downloads the build artifact from GitHub Releases, so no building happens on the server.

**Requirements:**
- A fresh Ubuntu server with SSH access as root
- SSH key authentication configured
- A successful GitHub Actions build (the `latest` release must exist)

```bash
./setup-pldb.sh <ip-address> <repo-url>
# Example:
./setup-pldb.sh 159.65.99.188 https://github.com/kaby76/pldb.git
```

The script will:
- Install Node.js 20.x
- Show a maintenance page while deploying
- Download the pre-built site from GitHub Releases
- Configure a systemd service (`pldb`) to serve the site on port 80
- Start the server automatically on boot

### Managing the server

```bash
systemctl status pldb    # Check status
systemctl restart pldb   # Restart server
systemctl stop pldb      # Stop server
journalctl -u pldb -f    # View logs
```

### Redeploying after changes

After pushing new changes to `main`, wait for the GitHub Actions build to complete, then re-run `setup-pldb.sh` to deploy the updated site.

## 🌐 Mirrors

The primary site is hosted at [pldb.io](https://pldb.io) via ScrollHub. For offline access or redundancy, you can clone the repository and build locally:

```bash
git clone https://github.com/breck7/pldb.git
cd pldb
git pull  # To keep updated
```
