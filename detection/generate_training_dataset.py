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

# ─── Hard Negative Examples (Label 0) ────────────────────────────────────────
# Enterprise prompts that contain sensitive-looking keywords but are actually safe.
# These train the model to NOT false-positive on normal business communication.
HARD_NEGATIVE_TEMPLATES = [
    # Code review with security keywords
    "Please review the authentication module for security vulnerabilities",
    "Can you check the password hashing implementation in the user service?",
    "Review the API key rotation mechanism in the credentials manager",
    "Check the token refresh logic in the OAuth flow",
    "Please verify the encryption key management in the vault integration",
    "Review the secret storage configuration for the staging environment",
    "Can you audit the access token validation in the middleware?",
    "Check the certificate pinning implementation for the mobile API",
    "Review the JWT signing configuration in the auth service",
    "Please verify the database credential rotation process",
    # Infrastructure discussions mentioning secrets
    "The password policy requires 12 characters minimum with special symbols",
    "We need to update the API key for the third-party integration",
    "The SSH key management needs to be automated",
    "Please rotate the service account tokens before the audit",
    "The encryption key rotation is scheduled for next Tuesday",
    "We should migrate from API keys to OAuth tokens",
    "The database password needs to meet compliance requirements",
    "The bearer token expiry should be reduced to 15 minutes",
    "The secret management vault is being upgraded this weekend",
    "The API key rate limiting is set to 1000 requests per minute",
    # Status reports mentioning security
    "The security scan found no vulnerabilities in the latest build",
    "The penetration test report shows all critical issues are resolved",
    "The credential rotation completed successfully across all environments",
    "The access token revocation endpoint is working correctly",
    "The secret scanning pipeline detected no new secrets in the repo",
    "The encryption at rest is using AES-256 as required",
    "The API authentication is using OAuth 2.0 with PKCE",
    "The database connections are using TLS 1.3",
    "The service mesh mTLS certificates are auto-rotated",
    "The security baseline assessment passed for all services",
    # Meeting scheduling with security context
    "Let us schedule a meeting to review the password reset flow",
    "Can you set up a call to discuss the API key management strategy?",
    "Please schedule the security review for the authentication service",
    "We need a meeting to plan the secret rotation for production",
    "Let us arrange a session to review the encryption standards",
    "Schedule a meeting with the security team about token validation",
    "Can you organize a review of the access control policies?",
    "Please set up a meeting to discuss the certificate management",
    "Let us schedule the compliance review for data protection",
    "Can you arrange the security training session for the team?",
    # Help requests about security features
    "How do I configure the password complexity requirements?",
    "Can you help me set up the API key rotation schedule?",
    "I need help with the token refresh implementation",
    "How do I implement the OAuth callback handler?",
    "Can you explain the HMAC signing process for webhooks?",
    "I need help configuring the TLS certificate for the load balancer",
    "How do I set up the secrets manager for the new service?",
    "Can you help me debug the JWT validation middleware?",
    "I need assistance with the API rate limiting configuration",
    "How do I implement the credential storage in the config?",
    # Documentation requests
    "Please document the API key management process",
    "Can you update the security guidelines for password storage?",
    "I need the documentation for the token validation flow",
    "Please review the security section of the architecture doc",
    "Can you document the secret rotation runbook?",
    "I need to update the access control documentation",
    "Please review the encryption standards document",
    "Can you document the incident response process for credential leaks?",
    "I need the API authentication flow diagram updated",
    "Please document the compliance requirements for data protection",
    # Planning and estimation
    "How long will the credential migration take?",
    "Can you estimate the effort for the API key management feature?",
    "What is the timeline for the security certification?",
    "How many sprints for the token management refactoring?",
    "Can you provide an estimate for the secrets vault upgrade?",
    "What is the projected timeline for the compliance audit?",
    "How long will the encryption key rotation take?",
    "Can you estimate the cost for the security tooling?",
    "What is the timeline for the access control redesign?",
    "How many developers for the authentication project?",
    # Architecture discussions
    "What is the proposed architecture for the secrets management?",
    "Can you review the token validation design?",
    "How does the credential rotation flow through the system?",
    "What are the failure modes for the key management?",
    "Can you explain the certificate lifecycle management?",
    "What is the disaster recovery for the vault?",
    "How do we ensure key consistency across services?",
    "What is the scalability plan for the auth service?",
    "Can you describe the encryption architecture?",
    "What is the key management strategy?",
    # Debugging security-related issues
    "The password validation is rejecting valid passwords",
    "The API key is not being passed correctly in headers",
    "The token refresh is failing intermittently",
    "The certificate validation is timing out",
    "The HMAC signature verification is returning false negatives",
    "The OAuth callback is not receiving the authorization code",
    "The JWT expiry check is incorrect in the middleware",
    "The secret rotation is not propagating to all services",
    "The encryption handshake is failing on the load balancer",
    "The access token is not being revoked on logout",
    # Configuration requests
    "How do I set up the password policy for the user service?",
    "Can you help configure the API key authentication?",
    "I need to configure the token validation middleware",
    "How do I set up the secret injection for the container?",
    "Can you help me configure the certificate chain?",
    "I need to set up the encryption at rest for the database",
    "How do I configure the HMAC signing for webhooks?",
    "Can you help me set up the mTLS for the service mesh?",
    "I need to configure the access control list for the API",
    "How do I set up the credential store for the application?",
    # Team communication about security
    "The security team approved the new authentication flow",
    "We completed the security training for all developers",
    "The penetration test results are available for review",
    "The security audit findings have been addressed",
    "The compliance checklist has been updated",
    "The security baseline has been applied to all environments",
    "The vulnerability scan shows no critical issues",
    "The access review has been completed for Q3",
    "The security metrics are showing improvement this quarter",
    "The incident response plan has been updated",
    # Performance discussions with security context
    "The authentication latency is under 50ms",
    "The token validation throughput meets the SLA",
    "The encryption overhead is within acceptable limits",
    "The key derivation time is optimized for the use case",
    "The certificate chain validation is efficient",
    "The HMAC computation is fast enough for real-time",
    "The JWT parsing performance is within targets",
    "The secret retrieval latency is under 10ms",
    "The access control check is adding minimal overhead",
    "The encryption performance meets the throughput requirements",
    # Process and methodology
    "What is our key rotation policy?",
    "How do we handle credential management?",
    "What is our incident response for security?",
    "How do we manage access control?",
    "What is our encryption standard?",
    "How do we handle certificate management?",
    "What is our vulnerability management process?",
    "How do we manage secrets in CI/CD?",
    "What is our compliance verification process?",
    "How do we handle security patches?",
    # Testing security features
    "The password strength validator tests are passing",
    "The API key authentication tests cover all edge cases",
    "The token refresh flow has comprehensive integration tests",
    "The encryption round-trip tests verify correctness",
    "The certificate validation tests cover all scenarios",
    "The HMAC verification tests include timing attack prevention",
    "The JWT expiry tests verify correct timezone handling",
    "The secret rotation tests verify zero-downtime",
    "The access control tests cover all permission levels",
    "The security middleware tests include rate limiting",
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

def generate_dataset(num_samples: int = 5000, num_hard_negatives: int = 200) -> list[tuple[str, int]]:
    dataset = []
    
    # Generate Safe Data (Label 0)
    for _ in range(num_samples // 2):
        text = random.choice(SAFE_TEMPLATES)
        text = generate_noise(text)
        dataset.append((text, 0))
    
    # Generate Hard Negatives (Label 0) — safe prompts with security keywords
    for _ in range(num_hard_negatives):
        text = random.choice(HARD_NEGATIVE_TEMPLATES)
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
    num_hard_negatives = 200
    total = num_samples + num_hard_negatives
    print(f"Generating synthetic dataset with {num_samples} base samples + {num_hard_negatives} hard negatives...")
    dataset = generate_dataset(num_samples, num_hard_negatives)
    
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        for text, label in dataset:
            writer.writerow([text, label])
            
    safe_count = sum(1 for _, l in dataset if l == 0)
    sensitive_count = sum(1 for _, l in dataset if l == 1)
    print(f"Dataset successfully saved to: {OUTPUT_FILE}")
    print(f"  Total: {len(dataset)} samples ({safe_count} safe, {sensitive_count} sensitive)")
    print(f"  Includes {num_hard_negatives} hard-negative enterprise prompts (safe with security keywords)")
    print("Data includes injected artificial noise/patterns to improve model F1 robustness.")

if __name__ == "__main__":
    main()
