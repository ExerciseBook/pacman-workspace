. "$HOME/.cargo/env" 
eval "$(atuin init zsh)"

export PATH=$HOME/.protoc/bin:$PATH
# export PROMPT="%n@%m %1~ %# "
export PROMPT='%n@%{%F{green}%}%m%{%f%} %1~ %# '

bindkey  "^[[H"   beginning-of-line
bindkey  "^[[F"   end-of-line
bindkey  "^[[3~"  delete-char
bindkey "\e[1;3D" backward-word
bindkey "\e[1;3C" forward-word
bindkey "^[[1;9D" beginning-of-line
bindkey "^[[1;9C" end-of-line

. $HOME/.local/spack/share/spack/setup-env.sh
