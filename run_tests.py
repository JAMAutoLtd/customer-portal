#!/usr/bin/env python
"""
Test runner script for scheduler API
"""

import os
import sys
import subprocess
import argparse


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description='Run scheduler API tests')
    parser.add_argument(
        '--api', action='store_true', help='Run only API tests'
    )
    parser.add_argument(
        '--unit', action='store_true', help='Run only unit tests'
    )
    parser.add_argument(
        '--cov', action='store_true', help='Run with coverage report'
    )
    parser.add_argument(
        '--test-env', action='store_true', help='Use test environment (.env.test)'
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true', help='Verbose output'
    )
    parser.add_argument(
        'pytest_args', nargs='*', help='Additional pytest arguments'
    )
    
    args = parser.parse_args()
    
    # Build command
    cmd = ['pytest']
    
    if args.api:
        cmd.append('tests/scheduler/api')
    elif args.unit:
        cmd.append('tests/scheduler/unit')
    
    if args.verbose:
        cmd.append('-v')
    
    if args.cov:
        cmd.append('--cov=src')
        cmd.append('--cov-report=term')
    
    # Add any additional pytest args
    cmd.extend(args.pytest_args)
    
    # Set environment variables
    env = os.environ.copy()
    if args.test_env:
        env['ENV_FILE'] = '.env.test'
    
    # Run the command
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, env=env)
    return result.returncode


if __name__ == '__main__':
    sys.exit(main()) 