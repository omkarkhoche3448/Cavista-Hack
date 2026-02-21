export default function DoctorProfile() {
  return (
    <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Doctor Profile</h1>
        <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center mb-4">
                <img
                    src="/doctor-avatar.png"
                    alt="Doctor Avatar"
                    className="w-24 h-24 rounded-full mr-4"
                />
                <div>
                    <h2 className="text-xl font-semibold">Dr. John Doe</h2>
                    <p className="text-gray-600">Cardiologist</p>
                </div>
            </div>
            <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">Contact Information</h3>
                <p>Email: doctor.johndoe@example.com</p>
                <p>Phone: (123) 456-7890</p>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Bio</h3>
                <p>
                    Dr. John Doe is a highly experienced cardiologist with over 15 years of practice. He specializes in treating heart conditions and is dedicated to providing the best care for his patients.
                </p>
            </div>
        </div>
    </div>
  );
}       