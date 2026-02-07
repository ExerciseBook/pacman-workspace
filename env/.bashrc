# export LD_LIBRARY_PATH=$HOME/miniforge3/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}

# Run zsh
if [ "$SHELL" != "$HOME/.local/bin/zsh" ]
then
    export SHELL="$HOME/.local/bin/zsh"
    exec $HOME/.local/bin/zsh 
fi

# 
# if [ "$SHELL" != "/usr/bin/zsh" ]
# then
#     export SHELL="/usr/bin/zsh"
#     exec /usr/bin/zsh
# fi
