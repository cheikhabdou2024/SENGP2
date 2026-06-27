# AWS Elastic Beanstalk Deployment Status

## Environment Information

- **Application Name**: sengp-backend
- **Environment**: sengp-backend-prod
- **Region**: us-east-1
- **URL**: http://sengp-backend-prod.eba-tby9x9hd.us-east-1.elasticbeanstalk.com
- **Platform**: Docker running on 64bit Amazon Linux 2
- **Status**: Infrastructure deployed, application not responding (502 Bad Gateway)

## What's Been Deployed

### Infrastructure
- ✅ EC2 Instance (t3.small)
- ✅ RDS PostgreSQL Database (db.t3.micro)
  - Username: sengpadmin
  - Password: <REDACTED — stored in EB env / AWS Secrets Manager. ROTATE: the
    previous value was committed to git history and must be considered leaked.>
  - Engine: PostgreSQL 16.6
- ✅ Application Load Balancer
- ✅ Auto Scaling Group
- ✅ Security Groups
- ✅ CloudWatch Logging

### Application Configuration
- ✅ Database connection updated to use EB RDS variables
- ✅ Environment variables configured
- ✅ Latest code deployed

## Current Issue

**Problem**: HTTP 502 Bad Gateway
**Likely Cause**: Docker container failing to start or crashing on startup

## Troubleshooting Steps

### 1. Check Application Logs

```bash
cd backend
export PATH=$PATH:~/.local/bin

# View recent logs
eb logs

# Or stream logs in real-time
eb logs --stream
```

### 2. Check Docker Container Status

First, set up SSH access:
```bash
eb ssh --setup
```

Then SSH into the instance:
```bash
eb ssh
```

Once inside, check Docker:
```bash
# Check if container is running
sudo docker ps -a

# Check container logs
sudo docker logs $(sudo docker ps -a -q | head -1)

# Check system logs
sudo tail -f /var/log/eb-docker/containers/eb-current-app/stdouterr.log
```

### 3. Common Issues to Check

#### Issue: Missing Node Modules or Build Artifacts
The Dockerfile uses multi-stage build. Ensure all files are copied correctly.

#### Issue: Database Connection
The RDS database takes a few minutes to be fully available. Check if:
- RDS environment variables are set: `eb printenv | grep RDS`
- Security groups allow EC2 to connect to RDS

#### Issue: Missing Environment Variables
Some optional dependencies might be required:
```bash
# Check all environment variables
eb printenv
```

#### Issue: Port Configuration
The app should listen on 0.0.0.0:5000 (already configured in server.ts)

### 4. Quick Fix Attempt

Try rebuilding and redeploying:
```bash
# Make sure you're in the backend directory
cd backend

# Redeploy
eb deploy

# Monitor deployment
eb status
eb health
```

### 5. Check Database Connection

The database configuration file (src/config/database.ts) has been updated to check for:
1. `RDS_HOSTNAME` (AWS EB RDS variables) - Priority 1
2. `DATABASE_URL` (connection string) - Priority 2
3. Individual `DB_*` variables - Priority 3

Verify RDS variables are set:
```bash
eb printenv | grep RDS
```

Expected output:
```
RDS_HOSTNAME = <rds-endpoint>
RDS_PORT = 5432
RDS_DB_NAME = ebdb
RDS_USERNAME = sengpadmin
RDS_PASSWORD = SengP2024SecureDB!
```

### 6. Test Locally with Docker

To verify the Docker image works:
```bash
cd backend

# Build the image
docker build -t sengp-backend-test .

# Run with environment variables
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e DB_HOST=your-local-db \
  -e DB_PORT=5432 \
  -e DB_NAME=sengp_db \
  -e DB_USER=postgres \
  -e DB_PASSWORD=yourpassword \
  -e JWT_SECRET=test-secret \
  sengp-backend-test

# Check if it responds
curl http://localhost:5000
```

## Environment Variables Currently Set

```
NODE_ENV=production
PORT=5000
API_VERSION=v1
JWT_SECRET=sengp-production-jwt-secret-2024-secure-key
JWT_REFRESH_SECRET=sengp-production-refresh-secret-2024-secure-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
AWS_ACCESS_KEY_ID=AKIA2LIP2D4UMLIMBD6G
AWS_SECRET_ACCESS_KEY=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
AWS_REGION=us-east-1
AWS_S3_BUCKET=sengp-storage
BCRYPT_ROUNDS=12
PLATFORM_COMMISSION_PERCENTAGE=10
LOG_LEVEL=info
```

## Missing Environment Variables (Optional - Set as Needed)

These are optional but may be required for full functionality:
```bash
eb setenv \
  SENDGRID_API_KEY=your-key \
  FROM_EMAIL=noreply@sengp.com \
  TWILIO_ACCOUNT_SID=your-sid \
  TWILIO_AUTH_TOKEN=your-token \
  WAVE_API_KEY=your-key \
  ORANGE_MONEY_CLIENT_ID=your-id \
  GOOGLE_MAPS_API_KEY=your-key
```

## Useful Commands

```bash
# Check environment status
eb status

# Check health
eb health

# View logs
eb logs

# Stream logs
eb logs --stream

# SSH into instance
eb ssh

# Redeploy
eb deploy

# Open in browser
eb open

# Terminate environment (CAREFUL!)
eb terminate sengp-backend-prod
```

## Cost Estimate

Current resources cost approximately:
- EC2 t3.small: ~$15/month
- RDS db.t3.micro: ~$15/month
- Load Balancer: ~$16/month
- Data transfer: Variable

**Total: ~$46-50/month**

## Security Reminders

⚠️ **IMPORTANT**: Your AWS credentials were shared in this session. For security:

1. Rotate your AWS access keys:
   - Go to AWS IAM Console
   - Navigate to Security Credentials
   - Delete the old access key: `AKIA2LIP2D4UMLIMBD6G`
   - Create a new access key
   - Update your local AWS configuration: `aws configure`

2. Use IAM roles instead of access keys when possible
3. Enable MFA on your AWS account
4. Review CloudWatch logs regularly

## Next Steps

1. **Immediate**: Run `eb logs` to identify why the container is crashing
2. **Fix the issue**: Based on log output, address the specific error
3. **Redeploy**: `eb deploy` after fixing
4. **Verify**: Test the endpoint and check health
5. **Add missing services**: Set up S3 bucket, configure other external services
6. **Set up CI/CD**: Automate deployments with GitHub Actions
7. **Configure domain**: Add custom domain and SSL certificate
8. **Rotate AWS credentials**: For security

## Support

If you need help:
- AWS EB Documentation: https://docs.aws.amazon.com/elasticbeanstalk/
- Check logs: `eb logs`
- AWS Support: https://console.aws.amazon.com/support/

## Files Modified

- `backend/src/config/database.ts` - Added RDS environment variable support
- `backend/.ebextensions/` - EB configuration files
- `backend/.ebignore` - Deployment exclusions
- Removed `backend/Dockerrun.aws.json` - Was conflicting with Dockerfile
