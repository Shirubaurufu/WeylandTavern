#!/usr/bin/env bash

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "This start script does not work on Windows."
	echo "Use the windows batch script instead."
	disown
    exit 1
fi

# Make sure pwd is the directory of the script
cd "$(dirname "$0")" > /dev/null 2>&1

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    read -p "npm is not installed. Do you want to install nodejs and npm? (y/n)" choice
    case "$choice" in
      y|Y )
        echo "Installing nvm..."
        export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" > /dev/null 2>&1
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash > /dev/null 2>&1
        source ~/.bashrc > /dev/null 2>&1
        nvm install --lts > /dev/null 2>&1
        nvm use --lts > /dev/null 2>&1;;
      n|N )
        echo "Nodejs and npm will not be installed."
        exit;;
      * )
        echo "Invalid option. Nodejs and npm will not be installed."
        exit;;
    esac
fi

git fetch origin -q
BEHIND=$(git rev-list --count HEAD..origin/release)
if [[ "$BEHIND" -gt 0 ]]; then
    echo "Found updates."
    echo "Updating WeylandTavern..."

    git stash -q

    if git pull origin release -q; then
        echo "WeylandTavern is now up to date!"
    else
        echo "There was an error updating WeylandTavern."
    fi

    git stash pop -q
fi

# Install Node Modules
echo "Installing Node Modules..."
export NODE_ENV=production
cd SillyTavern && npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev > /dev/null 2>&1

# Start SillyTavern
echo "Entering SillyTavern..."
node "server.js" "$@" > /dev/null 2>&1 &

disown
exit