import os
import pandas as pd
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer
)
import evaluate
import numpy as np

# Use the dataset we just generated
DATA_FILE = os.path.join(os.path.dirname(__file__), "sensitivity_training_data.csv")
MODEL_NAME = "distilbert-base-uncased"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "models/fine_tuned_distilbert")

def compute_metrics(eval_pred):
    metric = evaluate.load("f1")
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    # We use macro f1 to balance both classes, but you can also use "binary"
    return metric.compute(predictions=predictions, references=labels, average="macro")

def main():
    print(f"Loading dataset from {DATA_FILE}...")
    df = pd.read_csv(DATA_FILE)
    
    # Convert to HuggingFace Dataset
    hf_dataset = Dataset.from_pandas(df)
    
    # Split train/test (80/20)
    hf_dataset = hf_dataset.train_test_split(test_size=0.2)
    
    print(f"Loading tokenizer for {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    def tokenize_function(examples):
        return tokenizer(examples["text"], padding="max_length", truncation=True, max_length=128)
        
    print("Tokenizing dataset...")
    tokenized_datasets = hf_dataset.map(tokenize_function, batched=True)
    
    print(f"Loading {MODEL_NAME} for Sequence Classification...")
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)
    
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        eval_strategy="epoch",  # updated from deprecated evaluation_strategy
        learning_rate=2e-5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        num_train_epochs=3,
        weight_decay=0.01,
        save_strategy="epoch",
        load_best_model_at_end=True,
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"],
        compute_metrics=compute_metrics,
    )
    
    print("Starting Fine-Tuning Phase... This might take a few minutes depending on CPU/GPU.")
    trainer.train()
    
    print(f"Training complete! Saving the best model to {OUTPUT_DIR}...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("\n✅ Fine-tuning finished.")
    print(f"To use this in your ONNX pipeline, update HF_MODEL_NAME in onnx_classifier.py to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
