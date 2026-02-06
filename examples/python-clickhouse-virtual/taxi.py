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

"""
NYC Taxi Data Loader for ClickHouse

This script downloads and loads the NYC taxi trip dataset into ClickHouse.
The dataset contains information about taxi trips in New York City.
"""

import gzip
import io
import sys
import time
from typing import Optional

import clickhouse_connect
import pandas as pd
import requests

import config


def create_client():
    """Create and return a ClickHouse client connection."""
    print(
        f"Connecting to ClickHouse at {config.CLICKHOUSE_HOST}:{config.CLICKHOUSE_PORT}..."
    )
    client = clickhouse_connect.get_client(
        host=config.CLICKHOUSE_HOST,
        port=config.CLICKHOUSE_PORT,
        username=config.CLICKHOUSE_USER,
        password=config.CLICKHOUSE_PASSWORD,
    )
    print("Connected successfully!")
    return client


def create_database(client):
    """Create the database if it doesn't exist."""
    print(f"Creating database '{config.CLICKHOUSE_DATABASE}' if not exists...")
    client.command(f"CREATE DATABASE IF NOT EXISTS {config.CLICKHOUSE_DATABASE}")
    print(f"Database '{config.CLICKHOUSE_DATABASE}' is ready.")


def create_table(client):
    """Create the trips table with the NYC taxi schema."""
    print(f"Creating table '{config.NYC_TAXI_TABLE}'...")

    create_table_query = f"""
    CREATE TABLE IF NOT EXISTS {config.CLICKHOUSE_DATABASE}.{config.NYC_TAXI_TABLE}
    (
        trip_id             UInt32,
        vendor_id           String,
        pickup_datetime     DateTime,
        dropoff_datetime    DateTime,
        store_and_fwd_flag  UInt8,
        rate_code_id        UInt8,
        pickup_longitude    Float64,
        pickup_latitude     Float64,
        dropoff_longitude   Float64,
        dropoff_latitude    Float64,
        passenger_count     UInt8,
        trip_distance       Float64,
        fare_amount         Float32,
        extra               Float32,
        mta_tax             Float32,
        tip_amount          Float32,
        tolls_amount        Float32,
        ehail_fee           Float32,
        improvement_surcharge Float32,
        total_amount        Float32,
        payment_type        String,
        trip_type           UInt8,
        pickup_ntaname      String,
        dropoff_ntaname     String,
        cab_type            String,

        pickup_date Date MATERIALIZED toDate(pickup_datetime),
        pickup_hour UInt8 MATERIALIZED toHour(pickup_datetime)
    )
    ENGINE = MergeTree
    PARTITION BY toYYYYMM(pickup_datetime)
    ORDER BY (pickup_datetime, trip_id)
    """

    client.command(create_table_query)
    print(f"Table '{config.NYC_TAXI_TABLE}' created successfully!")


def verify_data(client):
    """Verify that data was loaded correctly."""
    print("\nVerifying data load...")

    count_query = (
        f"SELECT count() FROM {config.CLICKHOUSE_DATABASE}.{config.NYC_TAXI_TABLE}"
    )
    row_count = client.command(count_query)
    print(f"Total rows in table: {row_count:,}")

    sample_query = f"""
    SELECT
        pickup_datetime,
        dropoff_datetime,
        passenger_count,
        trip_distance,
        total_amount,
        cab_type
    FROM {config.CLICKHOUSE_DATABASE}.{config.NYC_TAXI_TABLE}
    LIMIT 5
    """

    result = client.query(sample_query)
    print("\nSample data:")
    print(result.result_rows)


def fetch():
    """Main execution function."""
    print("=" * 60)
    print("NYC Taxi Data Loader for ClickHouse")
    print("=" * 60)

    # Parse command line arguments
    limit = None
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
            print(f"\nLimiting load to {limit:,} rows (test mode)")
        except ValueError:
            print("Usage: python load_nyc_taxi.py [row_limit]")
            sys.exit(1)

    start_time = time.time()

    # Create connection
    client = create_client()

    # Set up database and table
    create_database(client)
    create_table(client)

    # Load data
    client.command(f"""
INSERT INTO {config.CLICKHOUSE_DATABASE}.{config.NYC_TAXI_TABLE}
SELECT * FROM s3(
'https://datasets-documentation.s3.eu-west-3.amazonaws.com/nyc-taxi/trips_0.gz',
'TabSeparatedWithNames'
)
SETTINGS input_format_allow_errors_num=25000;
""")

    # Verify
    verify_data(client)

    elapsed_time = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"Total time: {elapsed_time:.2f} seconds")
    print(f"{'=' * 60}")
