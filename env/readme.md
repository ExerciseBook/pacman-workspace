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
mamba install anaconda::ncurses -y
```

```bash
git clone https://github.com/zsh-users/zsh
cd zsh
git clean -fdx
autoheader
autoconf
./configure --prefix=$HOME/.local --enable-shared
make
make install
```