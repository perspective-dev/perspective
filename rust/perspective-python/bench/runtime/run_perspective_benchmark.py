#  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
#  ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
#  ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
#  ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
#  ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
#  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
#  ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
#  ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
#  ┃ This file is part of the Perspective library, distributed under the terms ┃
#  ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
#  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import os
import subprocess
from bench import VirtualEnvHandler
import logging

if __name__ == "__main__":
    """Benchmark the `perspective-python` runtime locally."""
    VERSIONS = [
        "master",
        "2.7.0",
        "2.6.0",
        "2.5.0",
        "2.4.0",
        "2.3.2",
        "2.3.1",
        # "2.3.0",
        "2.2.1",
        "2.2.0",
    ]

    # Access the benchmark virtualenv
    HERE = os.path.abspath(os.path.dirname(__file__))
    VIRTUALENV_NAME = "benchmark_venv"
    VIRTUALENV_PATH = os.path.join(HERE, "..", "..", "..", "..", VIRTUALENV_NAME)
    venv_handler = VirtualEnvHandler(VIRTUALENV_PATH)

    print("Benchmarking perspective-python==master")
    logging.info(venv_handler.activate_virtualenv())
    env = {k: v for (k, v) in os.environ.items()}
    env["PSP_VERSION"] = "master"

    subprocess.check_output(
        "python3 {}/perspective_benchmark.py master".format(HERE),
        shell=True,
        env=env,
    )

    # Run previous versions in virtualenv
    if not venv_handler.virtualenv_exists():
        venv_handler.create_virtualenv()

    last_version = "master"
    for version in VERSIONS[1:]:
        env["PSP_VERSION"] = version
        env["PYTHONPATH"] = ""
        logging.info("Uninstalling perspective-python=={}".format(last_version))
        last_version = version
        logging.debug(
            subprocess.check_output(
                "{} && yes | python3 -m pip uninstall perspective-python".format(venv_handler.activate_virtualenv()),
                shell=True,
                env=env,
            )
        )
        logging.info("Installing perspective-python=={}".format(version))
        logging.debug(
            subprocess.check_output(
                "{} && yes | python3 -m pip install perspective-python[dev]=={}".format(venv_handler.activate_virtualenv(), version),
                shell=True,
                env=env,
            )
        )
        logging.info("Benchmarking perspective-python=={}".format(version))
        subprocess.check_output(
            "{} && python3 {}/perspective_benchmark.py {}".format(venv_handler.activate_virtualenv(), HERE, version),
            shell=True,
            env=env,
        )
