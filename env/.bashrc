# Run zsh
if [ "$SHELL" != "$HOME/.local/bin/zsh" ]
then
    export SHELL="$HOME/.local/bin/zsh"
    exec $HOME/.local/bin/zsh 
fi
