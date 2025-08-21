#!/bin/bash
#SBATCH --job-name=log-latency
#SBATCH --nodes=3
#SBATCH --ntasks-per-node=8
#SBATCH --gres=gpu:8
#SBATCH --cpus-per-task=16
#SBATCH --time=02:00:00
#SBATCH --output=logs/bench_%j.log
#SBATCH --error=logs/bench_%j.log

set -eux

export PATH="$HOME/miniforge3/bin:$PATH"

. $HOME/.local/spack/share/spack/setup-env.sh
spack load cuda@12.8.1
spack load numactl@2.0.18

eval "$(mamba shell hook --shell bash)"

mamba activate deepep

export MASTER_PORT=$(shuf -i 30000-65000 -n 1)
export NNODES=3

srun --nodes=3 --ntasks-per-node=8 --cpus-per-task=16 --cpu-bind=none --exclusive \
  bash launcher.sh

