#!/bin/sh
cd "$(dirname "$0")" && docker compose --profile bridge stop && echo "Mawatheeq stopped. Data is kept."
