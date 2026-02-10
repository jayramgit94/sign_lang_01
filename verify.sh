#!/bin/bash
# Verification Checklist for Zoom Clone Project

echo "======================================"
echo "ZOOM CLONE - VERIFICATION CHECKLIST"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing"
        return 1
    fi
}

check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $1 contains '$2'"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing '$2'"
        return 1
    fi
}

echo "1. Configuration Files"
echo "===================="
check_file "backend/.env.example"
check_file "backend/.env"
check_file "frontend/.env.example"
check_file "frontend/.env.local"
check_file "frontend/.env.production"
echo ""

echo "2. Documentation Files"
echo "====================="
check_file "SETUP.md"
check_file "README.md"
check_file "FIXES_SUMMARY.md"
check_file "setup.bat"
echo ""

echo "3. Backend Configuration"
echo "======================="
check_content "backend/src/app.js" "8001" || true
check_content "backend/.gitignore" ".env" || true
check_content "backend/src/controllers/socketManager.js" "allowedOrigins" || true
echo ""

echo "4. Frontend Configuration"
echo "========================"
check_content "frontend/src/environment.js" "import.meta.env" || true
check_content "frontend/src/environment.js" "VITE_BACKEND_URL" || true
check_content "frontend/vite.config.js" "build:" || true
check_content "frontend/.gitignore" ".env" || true
echo ""

echo "5. Error Handling"
echo "================="
check_content "frontend/src/contexts/AuthContext.jsx" "try" || true
check_content "frontend/src/contexts/AuthContext.jsx" "catch" || true
check_content "frontend/src/pages/authentication.jsx" "result.success" || true
echo ""

echo "6. Security Fixes"
echo "================="
check_content "backend/src/controllers/socketManager.js" "NODE_ENV === \"production\"" || true
check_content "frontend/src/pages/landing.jsx" "randomCode" || true
check_content "backend/src/app.js" "/api/v1/user" || true
echo ""

echo "======================================"
echo "All checks complete!"
echo "======================================"
echo ""
echo "NEXT STEPS:"
echo "1. Edit backend/.env with MongoDB credentials"
echo "2. Run: cd backend && npm run dev"
echo "3. Run: cd frontend && npm run dev (in new terminal)"
echo "4. Open: http://localhost:8000"
echo ""
echo "For deployment, see SETUP.md"
echo ""
