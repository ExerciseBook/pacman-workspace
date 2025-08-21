# Install Atuin

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install atuin
```

# Install Zsh

```bash
git clean -fdx
autoheader
autoconf
./configure --prefix=$HOME/.local --enable-shared
make
make install
```
