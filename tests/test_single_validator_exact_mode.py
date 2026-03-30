import unittest

from explorer.server.simulation_worker import run_job


class SingleValidatorExactModeTests(unittest.TestCase):
    def test_exact_job_allows_single_validator_runs(self):
        result = run_job(
            "test-single-validator",
            {
                "paradigm": "SSP",
                "validators": 1,
                "slots": 1,
                "distribution": "homogeneous",
                "sourcePlacement": "homogeneous",
                "migrationCost": 0.0001,
                "attestationThreshold": 2 / 3,
                "slotTime": 12,
                "seed": 25873,
            },
        )

        self.assertEqual(result["config"]["validators"], 1)
        self.assertEqual(result["summary"]["slotsRecorded"], 1)
        self.assertEqual(result["summary"]["finalSupermajoritySuccess"], 100.0)
        self.assertEqual(result["summary"]["finalFailedBlockProposals"], 0.0)
        self.assertGreaterEqual(result["summary"]["finalAverageMev"], 0.0)


if __name__ == "__main__":
    unittest.main()
