#!/bin/bash

# auto-commit-push.sh - A script to automate git commit and push operations
# Usage: ./scripts/auto-commit-push.sh "Your commit message here"

# Set script to exit on error
set -e

echo "======== Git Auto Commit & Push ========"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "Error: git is not installed"
    exit 1
fi

# Check if the current directory is a git repository
if [ ! -d ".git" ]; then
    echo "Git is not initialized. Initializing repository..."
    git init
fi

# Ensure main branch exists and switch to it
if git show-ref --verify --quiet refs/heads/main; then
    git checkout main
else
    git checkout -b main
fi

# Set remote if not set, or update if needed
REMOTE_URL="https://github.com/HansTech-inc/flexpilot.git"
if git remote | grep -q origin; then
    CURRENT_URL=$(git remote get-url origin)
    if [ "$CURRENT_URL" != "$REMOTE_URL" ]; then
        echo "Updating remote repository URL..."
        git remote set-url origin "$REMOTE_URL"
    fi
else
    echo "Setting up remote repository..."
    git remote add origin "$REMOTE_URL"
fi

# Get commit message from argument or prompt for it
COMMIT_MESSAGE="$1"
if [ -z "$COMMIT_MESSAGE" ]; then
    echo "Enter commit message:"
    read -r COMMIT_MESSAGE
    if [ -z "$COMMIT_MESSAGE" ]; then
        COMMIT_MESSAGE="Update $(date +"%Y-%m-%d %H:%M:%S")"
        echo "Using default commit message: $COMMIT_MESSAGE"
    fi
fi

# Add all changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Adding all changes..."
    git add .

    # Commit (initial or normal) with user's message
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        echo "Creating initial commit with message: $COMMIT_MESSAGE"
        git commit -m "$COMMIT_MESSAGE"
    else
        echo "Committing changes with message: $COMMIT_MESSAGE"
        git commit -m "$COMMIT_MESSAGE"
    fi
else
    echo "No changes to commit. Working tree clean."
fi

# Push to remote (force if remote is empty)
echo "Pushing to remote origin..."
if git ls-remote --exit-code origin main &>/dev/null; then
    # Remote branch exists, normal push
    if git push -u origin main; then
        echo "Push successful!"
    else
        echo "Push failed. You may need to:"
        echo "1. Ensure you have write access to the repository"
        echo "2. Configure your Git credentials"
        echo "3. Use GitHub CLI: gh auth login"
        echo "4. Or manually push using: git push -u origin main"
        exit 1
    fi
else
    # Remote branch does not exist, force push
    if git push -u origin main; then
        echo "Initial push to remote successful!"
    else
        echo "Initial push failed. You may need to:"
        echo "1. Ensure you have write access to the repository"
        echo "2. Configure your Git credentials"
        echo "3. Use GitHub CLI: gh auth login"
        echo "4. Or manually push using: git push -u origin main"
        exit 1
    fi
fi

echo "======== Done ========"
