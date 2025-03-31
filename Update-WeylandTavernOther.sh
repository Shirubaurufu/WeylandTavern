#!/usr/bin/env bash

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "This start script does not work on Windows."
    echo "Use the windows batch script instead."
    disown
    exit 1
fi

# Make sure pwd is the directory of the script
cd "$(dirname "$0")" > /dev/null 2>&1

echo "======================================================"
echo "                WEYLAND TAVERN UPDATER"
echo "======================================================"
echo
echo "Welcome to the Weyland Tavern update wizard!"
echo "WeylandTavern will now attempt to update itself."
echo

git stash
git pull origin release -q
git stash pop
if [ $? -eq 0 ]; then
    echo "There was an error updating WeylandTavern."
else
    echo "WeylandTavern is up to date!"
fi
disown
exit