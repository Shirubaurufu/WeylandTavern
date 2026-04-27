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
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash > /dev/null 2>&1
        source ~/.bashrc > /dev/null 2>&1
        if ! command -v nvm &> /dev/null; then
            echo "NVM installation failed. Please install nodejs manually."
            exit 1
        fi
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

clear
echo ""
echo "==========================================================="
echo "            WELCOME TO WEYLAND TAVERN LAUNCHER"
echo "==========================================================="
echo ""
echo "This launcher will start the Weyland Tavern server."
echo "!!! Keep this window open while using Weyland Tavern!"
echo "    Closing this window will shut down the server."
echo ""
echo "==========================================================="
echo ""

# First check if git is installed
if ! command -v git &> /dev/null; then
    echo "Git is not installed. Cannot check for updates."
    echo "Please manually install git to get the latest updates."
    read -p "Continue without update checking? (Y/N) [Default: Y] " continue_nogit
    continue_nogit=${continue_nogit:-Y}
    if [[ "$continue_nogit" =~ ^[Nn]$ ]]; then
        exit 0
    fi
else
    # Get current branch name
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

    # Get current version (just the commit hash since we don't use tags)
    CURRENT_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

    echo "Checking for Weyland Tavern updates..."
    echo ""

    # Fetch latest from remote
    git fetch > /dev/null 2>&1

    # Get new version
    NEW_VERSION=$(git rev-parse --short origin/$CURRENT_BRANCH 2>/dev/null || echo "unknown")

    # Simply compare if they're different
    if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
        echo "Update found!"
        echo "  Current Version: $CURRENT_VERSION"
        echo "  New Version:     $NEW_VERSION"
        echo ""
        read -p "Apply update? (Y/N) [Default: Y] " apply_update
        apply_update=${apply_update:-Y}
    
        if [[ "$apply_update" =~ ^[Yy]$ ]]; then
            echo ""
            echo "Applying update..."
            
            if ! git pull > SillyTavern/WTUpdate.log 2>&1; then
                echo ""
                echo "[!] Update failed - there may be file conflicts."
                echo "[!] Generating log file: SillyTavern/WTUpdate.log"
                echo ""
                git diff --compact-summary | tee -a SillyTavern/WTUpdate.log
                echo ""
                read -p "Save your local changes and retry update? (Y/N) [Default: N] " stash
                stash=${stash:-N}
                
                if [[ "$stash" =~ ^[Yy]$ ]]; then
                    echo "Saving local changes..."
                    git stash clear
                    git stash
                    echo "Retrying update..."
                    
                    if ! git pull > SillyTavern/WTUpdate.log 2>&1; then
                        echo "[!] Update still failed. Please contact support."
                        echo "[!] Log saved to: SillyTavern/WTUpdate.log"
                        read -p "Continue without update? (Y/N) [Default: N] " continue_update
                        continue_update=${continue_update:-N}
                        if [[ "$continue_update" =~ ^[Nn]$ ]]; then
                            exit 0
                        fi
                    else
                        echo "Update applied successfully!"
                        read -p "Restore your saved changes? (Y/N) [Default: N] " restore
                        restore=${restore:-N}
                        if [[ "$restore" =~ ^[Yy]$ ]]; then
                            git stash pop
                        else
                            git stash clear
                        fi
                    fi
                else
                    read -p "Continue without update? (Y/N) [Default: N] " continue_update
                    continue_update=${continue_update:-N}
                    if [[ "$continue_update" =~ ^[Nn]$ ]]; then
                        exit 0
                    fi
                fi
            else
                echo "Update applied successfully!"
            fi
        else
            echo "Proceeding without update..."
        fi
    else
        echo "Weyland Tavern is up to date!"
        echo "  Current Version: $CURRENT_VERSION"
    fi
fi

echo ""
echo "-----------------------------------------------------------"
echo ""

CONFIG_FILE="SillyTavern/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
    if grep -qE '^[[:space:]]*enableCorsProxy:' "$CONFIG_FILE"; then
        tmpfile=$(mktemp)
        sed 's/^[[:space:]]*enableCorsProxy:.*/enableCorsProxy: true/' "$CONFIG_FILE" > "$tmpfile" && mv "$tmpfile" "$CONFIG_FILE"
    else
        printf '\nenableCorsProxy: true\n' >> "$CONFIG_FILE"
    fi
fi

# Install npm dependencies
export NODE_ENV=production
cd SillyTavern && npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev > /dev/null 2>&1

echo ""
echo "-----------------------------------------------------------"
echo ""
echo "Starting Weyland Tavern server..."
echo "A browser window should open automatically when ready."
echo ""
echo "==========================================================="
echo "             WEYLAND TAVERN IS NOW ACTIVE"
echo "             Server running on: localhost:8000"
echo "==========================================================="
echo ""
echo "REMINDER: Keep this window open!"
echo ""

# Start the SillyTavern server in background
node --max-old-space-size=3072 server.js --listen true --listen-host 0.0.0.0 --listen-port 8000 "$@" > /dev/null 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > .wt.pid

echo ""
echo "Press any key to SHUT DOWN and close Weyland Tavern..."
read -n 1 -s

echo ""
echo "Shutting down Weyland Tavern server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
rm .wt.pid > /dev/null 2>&1
exit 0
