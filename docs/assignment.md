# **CloudsineAI: WebTest Take-Home Assignment**

*"Clean code always looks like it was written by someone who cares."*  
— **Robert C. Martin**, *Author of Clean Code*

Welcome to the CloudsineAI take-home assignment! This project will help us evaluate your coding skills, problem-solving abilities, and design process. Let's get started!

---

## **Objective**
The goal of this assignment is to create a functional web application with GenAI hosted on **AWS EC2**. The application will integrate with the VirusTotal API to securely upload and scan files for malware or viruses.  Integrate with a free GenAI app such as Gemini API to explain the results to a lay end user.  

---

## **Features**
1. **File Upload and Scanning**: Build a web interface that allows users to upload files and scan them using the [VirusTotal API](https://docs.virustotal.com/reference/overview).
2. **Result Display**: Present the scan results dynamically and clearly on the webpage.
3. **GenAI Integration**: Integrate with a LLM to explain the results to a lay end user
4. **Customizable Design**: Add enhancements or optimizations to showcase your skills.

---

## **Assignment Steps**

### **Step 1: Set Up the Web Server on EC2**
1. Launch an **AWS EC2 instance** to host your web application:
   - Choose an appropriate instance type (e.g., t2.micro under the free tier) and configure the security group for web traffic (HTTP/HTTPS).  
   - Install and configure your preferred web server software, such as **Apache**, **NGINX**, or any other of your choice.
2. Ensure the instance is properly configured and accessible for hosting the web application.

---

### **Step 2: Develop the Web Application**
1. **Core Functionality**:
   - Implement a **file upload** feature with basic validation (e.g., file size/type).
   - Integrate with the VirusTotal API to scan the uploaded files.
   - Dynamically display the scan results on the webpage.
2. **Preferred Programming Languages**:
   - While **Golang** or **Python** are preferred, you may use any language or framework you are comfortable with.
3. **Security Considerations**:
   - Handle file uploads securely to prevent malicious file execution.
   - Sanitize API requests and responses.

---

### **Step 3: Test with Sample Files**
1. Use the provided sample files in this repository to test your application.
2. Verify that the scan results are displayed correctly after processing by the VirusTotal API.

---

## **Example Workflow**
1. A user uploads a file through the web interface.
2. The file is sent to the VirusTotal API for scanning.  
3. The API processes the file and returns the results.  
4. The scan results are displayed on the webpage in a user-friendly format.
5. Include a button where the GenAI can elaborate on the scan results to a lay end user.

---

## **Bonus Section: Optional Enhancements**
Go the extra mile by implementing one or both of the following:

### **1. Dockerization**
- Create separate **Dockerfiles** for development and production environments.
- Use **Docker Compose** to manage multi-container setups (e.g., integrating a PostgreSQL database).
- Optimize image sizes and configurations for faster deployments.

### **2. CI/CD Pipeline**
- Automate testing and deployments using a CI/CD pipeline (e.g., GitHub Actions or AWS CodePipeline).
- Include integration tests to ensure file uploads and VirusTotal API calls function correctly.
- Securely manage environment variables and secrets using tools like AWS Secrets Manager.

---

## **Evaluation Criteria**
You are free to use AI code assistants such as Cursor and Claude Code.  However, you are expected to be able to understand and explain most of the code.  

Your submission will be assessed on:
1. **Functionality**: Does the application meet the core requirements?  
2. **Code Quality**: Is the code modular, maintainable, and well-documented?  
3. **Problem-Solving**: How effectively did you address challenges and errors?  
4. **Creativity**: Did you add enhancements or optimizations to improve the application?  
5. **Presentation**: Is the solution polished and user-friendly?  

---

## **Resources**
- [AWS EC2 Getting Started Guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/get-set-up-for-amazon-ec2.html)  
- [VirusTotal API Documentation](https://docs.virustotal.com/reference/overview)  
- [PostgreSQL Quick Start Guide](https://www.postgresql.org/docs/current/tutorial.html)  
- [Gemini API Docs] https://ai.google.dev/gemini-api/docs
---

## **Submission Requirements**
1. **Documentation**:
   - Provide a detailed README explaining your setup process, challenges, and solutions.  
2. **Source Code**:
   - Share your codebase with clear instructions for running the application.  
3. **Deployment**:
   - Host your application on AWS EC2 and provide access for review.  
4. **Discussion**:
   - Be prepared to discuss your design choices, challenges faced, and any enhancements implemented.

---

## **Getting Started**
1. Clone this repository and review the provided sample files.  
2. Set up your AWS EC2 instance and deploy the web application.  
3. Test the file upload and VirusTotal integration locally before deploying it to AWS.

---

We look forward to seeing your innovative solutions and thoughtful designs!  
**CloudsineAI Team**  
