#!/bin/bash
# Production Verification Script
# Run this to verify your production setup is correct

echo "🔍 PRODUCTION SETUP VERIFICATION"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: .env not in Git
echo "1. Checking if .env is tracked in Git..."
if git ls-files | grep -q "backend/.env"; then
    echo -e "${RED}❌ SECURITY ISSUE: .env is in Git${NC}"
    echo "   Run: git rm --cached backend/.env && git commit -m 'remove .env'"
else
    echo -e "${GREEN}✅ .env is not tracked in Git${NC}"
fi
echo ""

# Check 2: .env is in .gitignore
echo "2. Checking if .env is in .gitignore..."
if grep -q "\.env" backend/.gitignore 2>/dev/null; then
    echo -e "${GREEN}✅ .env is in .gitignore${NC}"
else
    echo -e "${YELLOW}⚠️  .env might not be in .gitignore${NC}"
    echo "   Add this line to backend/.gitignore: .env"
fi
echo ""

# Check 3: vercel.json exists
echo "3. Checking frontend/vercel.json..."
if [ -f "frontend/vercel.json" ]; then
    echo -e "${GREEN}✅ vercel.json exists${NC}"
    if grep -q "/(.*)" frontend/vercel.json; then
        echo -e "${GREEN}✅ SPA routing configured correctly${NC}"
    else
        echo -e "${RED}❌ SPA routing might not be configured${NC}"
    fi
else
    echo -e "${RED}❌ vercel.json not found${NC}"
fi
echo ""

# Check 4: Environment variable template exists
echo "4. Checking .env.example..."
if [ -f "backend/.env.example" ]; then
    echo -e "${GREEN}✅ .env.example exists${NC}"
else
    echo -e "${YELLOW}⚠️  .env.example not found (optional but recommended)${NC}"
fi
echo ""

# Check 5: Tell user what to do
echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "1. Go to Render Dashboard: https://render.com/dashboard"
echo "2. Select your backend service"
echo "3. Settings → Environment"
echo "4. Set these variables:"
echo "   • MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db?..."
echo "   • PORT=8001"
echo "   • NODE_ENV=production"
echo "   • FRONTEND_URL=https://your-vercel-url.vercel.app"
echo ""
echo "5. Click Save and wait for auto-redeploy"
echo ""
echo "6. Go to Vercel Dashboard: https://vercel.com/dashboard"
echo "7. Select your Zoom project"
echo "8. Settings → Environment Variables"
echo "9. Set: VITE_BACKEND_URL=https://zoom-zako.onrender.com"
echo "10. Click Save and redeploy"
echo ""
echo "11. Test: curl https://zoom-zako.onrender.com/health"
echo "    Should return: {\"status\":\"ok\",\"database\":\"connected\"}"
echo ""
