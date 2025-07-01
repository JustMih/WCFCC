const DemoMac = require("../../models/demo_mac");
const getMacUserByPhoneNumber = async (req, res) => {
  const phoneNumber = req.query.phone_number;

  if (!phoneNumber) {
    return res
      .status(400)
      .json({ error: "phone_number query param is required" });
  }

  try {
    const user = await DemoMac.findOne({
      where: { phone_number: phoneNumber },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getMacUserByPhoneNumber };
