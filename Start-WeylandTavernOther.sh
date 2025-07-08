#!/bin/bash
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "This start script does not work on Windows."
    echo "Use the windows batch script instead."
    disown
    exit 1
fi

cd "$(dirname "$0")" > /dev/null 2>&1

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

echo "Attempting to update WeylandTavern..."
update() {
    if ! git pull > SillyTavern/WTUpdate.log 2>&1; then
        echo "There was an error updating WeylandTavern..."
        echo "Generating log file: SillyTavern/WTUpdate.log..."
        git diff --compact-summary | tee -a SillyTavern/WTUpdate.log

        read -p "Overwrite incorrect file changes and re-attempt update? (Y/N) [Default: N] " overwrite
        overwrite=${overwrite:-N}

        if [[ "$overwrite" =~ ^[Yy]$ ]]; then
            git stash
            update
            return
        fi

        echo "Please provide the WTUpdate log file to the WeylandTavern dev team at your convenience."
        read -p "WeylandTavern failed to update. Start anyway? (Y/N) [Default: N] " continue
        continue=${continue:-N}
        if [[ "$continue" =~ ^[Nn]$ ]]; then
            exit 0
        fi
    else
        echo "WeylandTavern is up to date!"
    fi
}

update

if [[ "$overwrite" =~ ^[Yy]$ ]]; then
    read -p "Revert differing files post update? (Y/N) [Default: N] " pop
    pop=${pop:-N}
    if [[ "$pop" =~ ^[Yy]$ ]]; then
        git stash pop
    else
        git stash clear
    fi
fi

echo "Installing Node Modules..."
export NODE_ENV=production
cd SillyTavern && npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev > /dev/null
echo "Checking for character updates..."
node "character-downloader.js" "https://mega.nz/folder/J5ARwZRI#2hnLHnLjXXNk3GGve7fjlw" "-u"
echo "Entering WeylandTavern..."
node --max-old-space-size=3072 "server.js" "--listen-host 0.0.0.0" "--listen-port 8000" "$@" > /dev/null 2>&1 &
echo "WeylandTavern is now active on localhost:8000 (By default)"
read -p "Press any key to exit."
exit 0