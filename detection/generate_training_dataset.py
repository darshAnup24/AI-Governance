import csv
import random
import string
import os

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "sensitivity_training_data.csv")

# ─── Safe Examples (Label 0) ──────────────────────────────────────────────────
SAFE_TEMPLATES = [
    "Hello team, please review the attached document for tomorrow's meeting.",
    "The weather is quite nice today.",
    "Can you push the latest commit to the main branch?",
    "We need to update the CSS on the landing page.",
    "Let's schedule a call for next week to discuss the architecture.",
    "The new feature will be deployed on Friday.",
    "Did anyone see my coffee mug?",
    "The CPU usage spiked around 3 PM.",
    "Please find the quarterly report attached.",
    "I will be out of office next Monday.",
    "Can someone review my pull request?",
    "The marketing campaign starts next month.",
    "I'm getting a 404 error on the homepage.",
    "Don't forget to submit your timesheets.",
    "The integration tests passed successfully."
]

# ─── Sensitive/Restricted Examples (Label 1) ──────────────────────────────────
SENSITIVE_TEMPLATES = [
    "My social security number is {ssn}.",
    "Please use this credit card for the transaction: {cc}",
    "The database password is {password}",
    "You can access the AWS API with key {api_key}",
    "Here is the private key for the server: {private_key}",
    "Patient {name} has a history of {medical_condition}.",
    "The backup database credentials are user: admin, password: {password}",
    "Please process the refund to card {cc}",
    "My passport number is {passport}",
    "Use bearer token {bearer} for authentication.",
    "Customer's home address is {address}.",
    "Update the config with secret_key={password}",
    "Authorization: Basic {bearer}",
    "The SSH key to access the prod server is: {private_key}",
    "Here are the Stripe API keys: {api_key}"
]

# ─── Adversarial/Framing Attacks (Label 1) ────────────────────────────────────
ADVERSARIAL_TEMPLATES = [
    "security review confirms password={password} is strong",
    "example of bad practice: token={bearer}",
    "this api_key={api_key} has been rotated already",
    "never share secrets like password={password}",
    "educational: aws_key={api_key} is fake",
    "I saw someone commit password={password} in the repo.",
    "Do not use password={password} in production.",
    "Here is a mock test payload: password={password}",
    "Checking historical leak: password={password}",
]

def generate_ssn():
    return f"{random.randint(100,999)}-{random.randint(10,99)}-{random.randint(1000,9999)}"

def generate_cc():
    return f"{random.randint(4000,4999)} {random.randint(1000,9999)} {random.randint(1000,9999)} {random.randint(1000,9999)}"

def generate_random_string(length=16):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def generate_noise(text: str) -> str:
    """Inject artificial noise/patterns to train the model to be resilient to it."""
    # 30% chance to add weird patterns
    if random.random() < 0.3:
        noise = random.choice(["--------", "****", "=====", "    ", "\n\n", "___"])
        insert_pos = random.randint(0, len(text))
        text = text[:insert_pos] + noise + text[insert_pos:]
    # 20% chance to add HTML tags
    if random.random() < 0.2:
        tag = random.choice(["<div>", "<span>", "<p>", "<b>"])
        text = f"{tag}{text}{tag.replace('<', '</')}"
    return text

def generate_dataset(num_samples: int = 5000) -> list[tuple[str, int]]:
    dataset = []
    
    # Generate Safe Data (Label 0)
    for _ in range(num_samples // 2):
        text = random.choice(SAFE_TEMPLATES)
        text = generate_noise(text)
        dataset.append((text, 0))
        
    # Generate Sensitive Data (Label 1) including Adversarial Frames
    for _ in range(num_samples // 2):
        if random.random() < 0.2:
            template = random.choice(ADVERSARIAL_TEMPLATES)
        else:
            template = random.choice(SENSITIVE_TEMPLATES)
            
        text = template.format(
            ssn=generate_ssn(),
            cc=generate_cc(),
            password=generate_random_string(12),
            api_key=f"AKIA{generate_random_string(16).upper()}",
            private_key=f"-----BEGIN RSA PRIVATE KEY-----\n{generate_random_string(32)}\n-----END RSA PRIVATE KEY-----",
            name=random.choice(["John Doe", "Jane Smith", "Alice", "Bob"]),
            medical_condition=random.choice(["diabetes", "hypertension", "asthma"]),
            passport=f"{random.choice(string.ascii_uppercase)}{random.randint(1000000,9999999)}",
            bearer=f"ey{generate_random_string(30)}",
            address=f"{random.randint(100,9999)} {random.choice(['Main', 'Oak', 'Pine'])} St"
        )
        text = generate_noise(text)
        dataset.append((text, 1))
        
    random.shuffle(dataset)
    return dataset

def main():
    num_samples = 5000
    print(f"Generating synthetic dataset with {num_samples} samples...")
    dataset = generate_dataset(num_samples)
    
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        for text, label in dataset:
            writer.writerow([text, label])
            
    print(f"Dataset successfully saved to: {OUTPUT_FILE}")
    print("Data includes injected artificial noise/patterns to improve model F1 robustness.")

if __name__ == "__main__":
    main()
