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


echo "Updating WeylandTavern..."
if git pull -q; then
    echo "WeylandTavern is up to date!"
else
    echo "There was an error updating WeylandTavern..."
    echo "Generating log file SillyTavern/WTUpdate.log..."
    git diff >> SillyTavern/WTUpdate.log
    echo "Please provide the log file to the Weyland Tavern dev team at your convenience."
fi

echo "Installing Node Modules..."
export NODE_ENV=production
cd SillyTavern && npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev > /dev/null 2>&1

echo "Entering WeylandTavern..."
node "server.js" "$@" > /dev/null 2>&1 &
echo "WeylandTavern is now active on localhost:8000 (By default)"
read -p "Press any key to exit."
exit
