# Install Miniforge

https://github.com/conda-forge/miniforge/


# Install Atuin

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install atuin --jobs 4
```

# Install Zsh

```
mamba install autoconf make -y
mamba install conda-forge::ncurses -y
```

```bash
export CFLAGS="-I$HOME/miniforge3/include $CFLAGS"
export CPPFLAGS="-I$HOME/miniforge3/include $CPPFLAGS"
export LIBRARY_PATH=$HOME/miniforge3/lib${LIBRARY_PATH:+:$LIBRARY_PATH}
export LD_LIBRARY_PATH=$HOME/miniforge3/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}

git clone https://github.com/zsh-users/zsh
cd zsh
git clean -fdx
autoheader
autoconf
./configure --prefix=$HOME/.local --enable-shared
make
make install
```