from setuptools import setup, find_packages

setup(
    name="airlock-sdk",
    version="0.1.0",
    description="Official Python SDK for the Airlock AI Governance Firewall",
    packages=find_packages(),
    install_requires=["httpx>=0.27"],
    python_requires=">=3.10",
)
