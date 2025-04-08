const User = require("../../models/User");

const getAllAgent = async (req, res) => {
    try {
        const agent = await User.findAll({
            where: {role: "agent"}
        })
        const agentCount = agent.length;

        res.status(200).json({agentCount});
    } catch (error) {
        res.status(500).json({message: "server error", error: error.message});
    }
}

const getAllAdmin = async (req, res) => {
    try {
        const admin = await User.findAll({
            where: {role: "admin"}
        })
        const adminCount = admin.length;
        res.status(200).json({adminCount})
    } catch (error) {
        res.status(500).json({message: "server error", error: error.message});
    }
}
const getAllSupervisor = async (req, res) => {
  try {
    const supervisor = await User.findAll({
      where: { role: "supervisor" },
    });
    const supervisorCount = supervisor.length;
    res.status(200).json({ supervisorCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

const getAllAttendee = async (req, res) => {
  try {
    const attendee = await User.findAll({
      where: { role: "attendee" },
    });
    const attendeeCount = attendee.length;
    res.status(200).json({ attendeeCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

const getAllCoordinator = async (req, res) => {
  try {
    const coordinator = await User.findAll({
      where: { role: "coordinator" },
    });
    const coordinatorCount = coordinator.length;
    res.status(200).json({ coordinatorCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};
const getAllHeadOfUnit = async (req, res) => {
  try {
    const headOfUnit = await User.findAll({
      where: { role: "head-of-unit" },
    });
    const headOfUnitCount = headOfUnit.length;
    res.status(200).json({ headOfUnitCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

const getAllManager = async (req, res) => {
  try {
    const manager = await User.findAll({
      where: { role: "manager" },
    });
    const managerCount = manager.length;
    res.status(200).json({ managerCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

const getAllDirectorGeneral = async (req, res) => {
  try {
    const directorManager = await User.findAll({
      where: { role: "director-general" },
    });
    const directorGeneralCount = directorManager.length;
    res.status(200).json({ directorGeneralCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

const getAllDirectorFocalPerson = async (req, res) => {
  try {
    const focalPerson = await User.findAll({
      where: { role: "focal-person" },
    });
    const focalPersonCount = focalPerson.length;
    res.status(200).json({ focalPersonCount });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

module.exports = {
  getAllAgent,
  getAllAdmin,
  getAllSupervisor,
  getAllAttendee,
  getAllCoordinator,
  getAllManager,
  getAllDirectorGeneral,
  getAllDirectorFocalPerson,
};