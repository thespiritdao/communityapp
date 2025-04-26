import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a Nodemailer transporter using your SMTP details
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// sendEmail function using Nodemailer
async function sendEmail(to: string, subject: string, text: string) {
  const mailOptions = {
    from: process.env.EMAIL_FROM, // your verified sender email
    to,
    subject,
    text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return true;
  } catch (error: any) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Expecting these fields from the frontend
  const { 
    userAddress, 
    productId, 
    productName,   // Name of the artifact from your products table
    productQuantity,  // How many artifacts were purchased
    systemAmount, 
    selfAmount 
  } = req.body;

  try {
    // Query user_profiles for additional user details
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("email, first_name, last_name, address, phone")
      .eq("wallet_address", userAddress)
      .single();

    if (fetchError || !profile) {
      throw new Error(fetchError ? fetchError.message : "User profile not found");
    }

    const userEmail = profile.email;

    // Prepare email content for the user
    const subjectUser = "🔮 SpiritDAO Artifact Acquisition";
    const textUser = `Dear ${profile.first_name},

Your purchase for artifact "${productName}" (ID: ${productId}) has been completed.
Quantity: ${productQuantity}
Deducted: $SYSTEM ${systemAmount} and $SELF ${selfAmount}.

Thank you for being a part of our community! We'll notify you with tracking information once the artifact is shipped.
`;

    // Prepare email content for the admin team
    const subjectAdmin = "🔮 Artifact Purchase Alert";
    const textAdmin = `Artifact Purchase Details:
--------------------------------------------------
Member Name: ${profile.first_name} ${profile.last_name}
Address: ${profile.address}
Phone: ${profile.phone}

Artifact Details:
Artifact ID: ${productId}
Artifact Name: ${productName}
Quantity: ${productQuantity}

Deducted: $SYSTEM ${systemAmount} and $SELF ${selfAmount}
--------------------------------------------------
Please prepare for shipment.
`;

    // Send emails
    await sendEmail(userEmail, subjectUser, textUser);
    await sendEmail("community@spiritdao.org", subjectAdmin, textAdmin);

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("notifyPurchase error:", error);
    res.status(500).json({ error: error.message });
  }
}
