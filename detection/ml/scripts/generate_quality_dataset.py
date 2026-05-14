#!/usr/bin/env python3
"""
High-Quality Synthetic Dataset Generator using Ollama
Generates realistic, diverse, labeled examples for AI governance detection.

Uses: Llama 3.1:8b (running locally via Ollama)
Output: detection/ml/data/raw/labeled_dataset.jsonl
"""

import json
import requests
import time
from typing import Dict, List, Tuple
from collections import defaultdict
import random

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.1:8b"
OUTPUT_FILE = "../data/raw/labeled_dataset.jsonl"

# Per-category sample count (realistic distribution)
SAMPLES_PER_CATEGORY = {
    "SAFE": 3500,           # 70% of dataset (realistic)
    "CREDENTIALS": 300,     # ~6%
    "PII": 250,             # ~5%
    "PROMPT_INJECTION": 250,# ~5%
    "HALLUCINATION": 300,   # ~6%
    "BIAS": 200,            # ~4%
    "REGULATORY": 200,      # ~4%
}

# Generation prompts - designed to create realistic, diverse examples
GENERATION_PROMPTS = {
    "SAFE": [
        "Generate a legitimate technical question about Python programming that a developer would ask:",
        "Generate a realistic question about data science and machine learning:",
        "Generate a question about web development best practices:",
        "Generate a question about cloud infrastructure and deployment:",
        "Generate a question about database design and optimization:",
        "Generate a realistic code review question:",
        "Generate a legitimate question about system design:",
        "Generate a question about security best practices in software:",
        "Generate a question about testing strategies and methodologies:",
        "Generate a question about DevOps and CI/CD pipelines:",
    ],
    
    "CREDENTIALS": [
        "Generate a realistic scenario where someone accidentally exposes an API key or secret in code or logs:",
        "Generate an example of hardcoded credentials that a developer might accidentally commit:",
        "Create a scenario where database connection strings are exposed:",
        "Generate an example of exposed AWS keys or cloud credentials:",
        "Create a scenario with accidentally shared GitHub tokens or OAuth secrets:",
        "Generate an example with exposed SSH keys or private keys:",
        "Create a realistic scenario with exposed database passwords:",
        "Generate an example with exposed API keys for third-party services:",
        "Create a scenario with exposed authentication tokens in code:",
        "Generate an example of exposed encryption keys or certificate data:",
    ],
    
    "PII": [
        "Generate a scenario where personal information like SSN or phone number is mentioned:",
        "Create an example where someone shares home address or location data:",
        "Generate a scenario with leaked health or medical information:",
        "Create an example where employment history is exposed:",
        "Generate a scenario with financial account information being shared:",
        "Create an example where driver's license or ID information is mentioned:",
        "Generate a scenario with passport or visa information:",
        "Create an example where email addresses or phone contacts are listed:",
        "Generate a scenario with personal identification numbers:",
        "Create an example where family member names or relationships are disclosed:",
    ],
    
    "PROMPT_INJECTION": [
        "Generate a subtle prompt injection that tries to make an AI ignore safety guidelines without obvious red flags:",
        "Create a jailbreak attempt that uses roleplay or hypothetical scenarios:",
        "Generate a prompt that tries to trick the AI into bypassing restrictions through indirect requests:",
        "Create an instruction override attempt using technical-sounding language:",
        "Generate a prompt injection using system prompt disclosure techniques:",
        "Create an attempt to make the AI act as an unrestricted version of itself:",
        "Generate a prompt that uses confusion or multi-layered instructions to bypass safety:",
        "Create a jailbreak using reasoning about 'what if' scenarios:",
        "Generate a prompt injection that exploits the model's instruction following:",
        "Create an attempt to make the AI ignore its guidelines through creative framing:",
    ],
    
    "HALLUCINATION": [
        "Generate a confident but false claim about a real person's credentials or achievements:",
        "Create a scenario with made-up statistics presented as fact:",
        "Generate a false citation that sounds authoritative but isn't real:",
        "Create a scenario with incorrect historical facts stated confidently:",
        "Generate a false technical claim about how software or systems work:",
        "Create a scenario with fabricated research findings or study results:",
        "Generate a false quote attributed to a public figure:",
        "Create a scenario with invented product features or capabilities:",
        "Generate a confidently stated false correlation or causation:",
        "Create a scenario with non-existent company policies or procedures:",
    ],
    
    "BIAS": [
        "Generate a statement that shows age-based discrimination or stereotypes:",
        "Create an example with gender-based assumptions or discriminatory language:",
        "Generate a statement with racial or ethnic stereotypes:",
        "Create an example showing disability-based discrimination:",
        "Generate a statement with socioeconomic class stereotypes:",
        "Create an example with religious or cultural discrimination:",
        "Generate a statement showing sexual orientation or gender identity bias:",
        "Create an example with appearance-based discrimination:",
        "Generate a statement with national origin or immigration status bias:",
        "Create an example with health status-based discrimination:",
    ],
    
    "REGULATORY": [
        "Generate a scenario that violates GDPR data protection requirements:",
        "Create an example of potential HIPAA violation (healthcare data):",
        "Generate a scenario breaking PCI DSS compliance for payment data:",
        "Create an example violating CCPA privacy requirements:",
        "Generate a scenario with non-compliance to SOX regulations:",
        "Create an example breaking ADA accessibility requirements:",
        "Generate a scenario violating COPPA child privacy rules:",
        "Create an example with FCA financial compliance violations:",
        "Generate a scenario breaking data residency or export control rules:",
        "Create an example violating consumer protection regulations:",
    ],
}

def call_ollama(prompt: str, max_retries: int = 3) -> str:
    """Call Ollama API with retry logic."""
    for attempt in range(max_retries):
        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.7,  # Some diversity
                    "top_p": 0.9,
                    "num_predict": 200,  # Limit length
                },
                timeout=30,
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                print(f"  API error (attempt {attempt+1}): {response.status_code}")
                time.sleep(2)
        except requests.exceptions.RequestException as e:
            print(f"  Connection error (attempt {attempt+1}): {e}")
            time.sleep(2)
    
    return None

def generate_category_examples(category: str, count: int) -> List[Dict]:
    """Generate examples for a specific category."""
    examples = []
    prompts = GENERATION_PROMPTS.get(category, [])
    
    if not prompts:
        print(f"  ⚠️  No prompts for {category}")
        return examples
    
    print(f"  Generating {count} {category} examples...")
    
    for i in range(count):
        # Rotate through prompts for diversity
        prompt_template = prompts[i % len(prompts)]
        
        # Add variation hint
        variation = f" (variant {i % 5 + 1})" if i > 0 else ""
        full_prompt = prompt_template + variation
        
        generated_text = call_ollama(full_prompt)
        
        if not generated_text:
            print(f"    ⚠️  Generation failed for {category} sample {i+1}, skipping")
            continue
        
        # Validate text is not empty and not too short
        if len(generated_text.strip()) < 20:
            print(f"    ⚠️  Generated text too short for {category} sample {i+1}, skipping")
            continue
        
        # Create labels
        labels = {
            "SAFE": category == "SAFE",
            "PII": category == "PII",
            "CREDENTIALS": category == "CREDENTIALS",
            "PROMPT_INJECTION": category == "PROMPT_INJECTION",
            "HALLUCINATION": category == "HALLUCINATION",
            "BIAS": category == "BIAS",
            "REGULATORY": category == "REGULATORY",
        }
        
        # Handle multi-label cases (realistic scenarios)
        if category == "CREDENTIALS" and random.random() < 0.2:
            # 20% of CREDENTIALS also involve PII
            labels["PII"] = True
        elif category == "REGULATORY" and random.random() < 0.15:
            # 15% of REGULATORY also involve PII or CREDENTIALS
            if random.choice([True, False]):
                labels["PII"] = True
            else:
                labels["CREDENTIALS"] = True
        
        example = {
            "text": generated_text,
            "labels": labels,
            "source": "ollama_generated",
            "notes": f"{category} example generated via Llama 3.1"
        }
        
        examples.append(example)
        
        # Progress indicator
        if (i + 1) % 10 == 0:
            print(f"    ✓ {i+1}/{count} examples generated")
        
        # Rate limiting (be nice to Ollama)
        if (i + 1) % 50 == 0:
            print(f"    Pausing for 2 seconds...")
            time.sleep(2)
    
    print(f"  ✓ Generated {len(examples)}/{count} valid {category} examples")
    return examples

def save_dataset(all_examples: List[Dict], output_file: str):
    """Save dataset to JSONL format."""
    print(f"\n📝 Saving dataset to {output_file}...")
    
    with open(output_file, 'w') as f:
        for example in all_examples:
            f.write(json.dumps(example) + '\n')
    
    print(f"✓ Saved {len(all_examples)} examples")

def validate_dataset(output_file: str):
    """Validate the generated dataset."""
    print(f"\n🔍 Validating dataset...")
    
    label_counts = defaultdict(int)
    total = 0
    errors = 0
    
    with open(output_file, 'r') as f:
        for i, line in enumerate(f):
            try:
                data = json.loads(line)
                total += 1
                
                # Count labels
                labels = data.get('labels', {})
                for label, value in labels.items():
                    if value:
                        label_counts[label] += 1
                
                # Validate structure
                assert 'text' in data, "Missing 'text' field"
                assert 'labels' in data, "Missing 'labels' field"
                assert len(data['text']) > 20, "Text too short"
                assert all(isinstance(v, bool) for v in labels.values()), "Labels must be bool"
                
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  ⚠️  Line {i+1} error: {e}")
    
    print(f"✓ Total samples: {total}")
    print(f"  Errors: {errors}")
    print(f"\n  Label distribution:")
    for label, count in sorted(label_counts.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total) * 100
        print(f"    {label:20s}: {count:5d} ({pct:5.1f}%)")

def main():
    print("="*70)
    print("High-Quality Dataset Generator using Ollama")
    print("="*70)
    
    print("\n🚀 Starting generation process...")
    print(f"   Model: {MODEL}")
    print(f"   Ollama API: {OLLAMA_URL}")
    
    # Check Ollama connectivity
    print("\n⏳ Checking Ollama connectivity...")
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            print(f"✓ Ollama connected! Found {len(models)} model(s)")
            if not any(m["name"].startswith("llama3.1") for m in models):
                print("⚠️  Warning: llama3.1 not found, may need to pull it")
        else:
            print("❌ Ollama responded but with error status")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to Ollama: {e}")
        print("   Make sure Ollama is running and model is loaded")
        return False
    
    all_examples = []
    total_target = sum(SAMPLES_PER_CATEGORY.values())
    
    print(f"\n📊 Generation targets:")
    for category, count in sorted(SAMPLES_PER_CATEGORY.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total_target) * 100
        print(f"   {category:20s}: {count:5d} ({pct:5.1f}%)")
    
    # Generate per category
    print(f"\n🔧 Generating {total_target} total examples...\n")
    
    for category in sorted(SAMPLES_PER_CATEGORY.keys()):
        count = SAMPLES_PER_CATEGORY[category]
        examples = generate_category_examples(category, count)
        all_examples.extend(examples)
        time.sleep(1)  # Pause between categories
    
    # Shuffle for better training
    print("\n🔀 Shuffling dataset...")
    random.shuffle(all_examples)
    
    # Save
    save_dataset(all_examples, OUTPUT_FILE)
    
    # Validate
    validate_dataset(OUTPUT_FILE)
    
    print("\n" + "="*70)
    print("✅ Dataset generation complete!")
    print(f"   File: {OUTPUT_FILE}")
    print(f"   Size: {len(all_examples)} samples")
    print("="*70)
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Generation interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
