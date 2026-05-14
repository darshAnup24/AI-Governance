import openai
import httpx
import json

print("\n" + "="*50)
print("🛡️  SIMULATING CORPORATE NETWORK / DNS INTERCEPTION")
print("="*50)

# -------------------------------------------------------------------------
# 1. THE SIMULATION: 
# This class acts exactly like a Corporate DNS server / VPN.
# When the employee's computer tries to lookup 'api.openai.com', 
# the network secretly routes it to the AI Governance Proxy (127.0.0.1:8000).
# -------------------------------------------------------------------------
class CorporateNetworkInterceptor(httpx.HTTPTransport):
    def handle_request(self, request: httpx.Request) -> httpx.Response:
        # If traffic is heading to OpenAI, hijack it!
        if request.url.host == "api.openai.com":
            print(f"\n[NETWORK LAYER]: Intercepting traffic to {request.url.host}")
            print(f"[NETWORK LAYER]: Routing to AI Governance Proxy at 127.0.0.1:8000...")
            
            # Rewrite the destination to our local proxy
            request.url = request.url.copy_with(
                scheme="http", 
                host="127.0.0.1", 
                port=8000
            )
        return super().handle_request(request)

# Create a custom network client with our DNS interceptor
corporate_network_client = httpx.Client(transport=CorporateNetworkInterceptor())


# -------------------------------------------------------------------------
# 2. THE EMPLOYEE's CODE:
# The employee writes standard OpenAI code. They DO NOT change the base_url.
# They believe they are talking directly to OpenAI.
# -------------------------------------------------------------------------
print("\n[EMPLOYEE]: Running standard OpenAI script...")

client = openai.OpenAI(
    api_key="sk-fake-openai-key-for-demo",
    # We pass the custom client here to simulate the machine's network state
    http_client=corporate_network_client 
)

try:
    print("[EMPLOYEE]: Sending prompt -> 'Please review this credit card: 4326 1874 5012 4334'")
    
    # Employee attempts to make a standard API call
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Please review this credit card: 4326 1874 5012 4334"}]
    )
    print("\n[EMPLOYEE]: Response received successfully.")
    print(response.choices[0].message.content)

except openai.APIStatusError as e:
    # This is what the employee sees when the proxy blocks it!
    print("\n❌ API REQUEST FAILED!")
    
    error_data = e.response.json()
    print(f"\n[FIREWALL RESPONSE]:")
    print(json.dumps(error_data, indent=2))
    print(f"\n[EXPLANATION]: The Corporate DNS successfully hijacked the request,")
    print("scanned it, found the credit card (PII), and blocked it before it left the building!")
