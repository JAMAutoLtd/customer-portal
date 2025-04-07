from setuptools import setup, find_packages

setup(
    name="customer-portal",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "pytest>=8.3.5",
        "pydantic>=2.0.0",
        "fastapi>=0.100.0",
        "sqlalchemy>=2.0.0",
        "datetime",
        "typing",
        "ortools>=9.0",
    ],
) 